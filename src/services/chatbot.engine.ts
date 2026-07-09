import { logger } from '../config/logger';
import { ChatbotFlow, IChatbotFlow } from '../models/ChatbotFlow';
import { Conversation, IConversation } from '../models/Conversation';
import { Contact, IContact } from '../models/Contact';
import { ChatbotNode } from '../types';
import * as waService from './whatsapp.service';

/**
 * Chatbot execution engine.
 *
 * Given an incoming message and the contact's current position in a flow,
 * determines the next node to execute, sends the appropriate WhatsApp message,
 * and updates the conversation's botState.
 */

/**
 * Check if an incoming message matches any chatbot triggers.
 * Called from webhook.service after processing an inbound message.
 */
export async function processChatbotTrigger(
  waAccountId: string,
  conversation: IConversation,
  contact: IContact,
  messageText: string,
  isFirstMessage: boolean,
  io: any
): Promise<void> {
  try {
    // 1. If conversation already has an active bot flow, continue it
    if (conversation.botState) {
      await continueFlow(waAccountId, conversation, contact, messageText, io);
      return;
    }

    // 2. Check for keyword trigger match (always takes priority)
    const keywordFlow = await findKeywordFlow(waAccountId, messageText);
    if (keywordFlow) {
      await startFlow(waAccountId, conversation, contact, keywordFlow, io);
      return;
    }

    // 3. Check for welcome flow (first-time contacts only)
    if (isFirstMessage) {
      const welcomeFlow = await ChatbotFlow.findOne({
        waAccountId,
        trigger: 'welcome_message',
        isActive: true,
      });

      if (welcomeFlow) {
        await startFlow(waAccountId, conversation, contact, welcomeFlow, io);
        return;
      }
    }

    // 4. Check for default flow (catch-all)
    const defaultFlow = await ChatbotFlow.findOne({
      waAccountId,
      trigger: 'default',
      isActive: true,
    });

    if (defaultFlow) {
      await startFlow(waAccountId, conversation, contact, defaultFlow, io);
    }

    // No matching flow → do nothing (agent will handle manually)
  } catch (error) {
    logger.error('Chatbot trigger processing error:', error);
  }
}

/**
 * Find a keyword-triggered flow that matches the message text.
 */
async function findKeywordFlow(
  waAccountId: string,
  messageText: string
): Promise<IChatbotFlow | null> {
  const activeFlows = await ChatbotFlow.find({
    waAccountId,
    trigger: 'keyword',
    isActive: true,
  });

  const lowerText = messageText.toLowerCase().trim();

  for (const flow of activeFlows) {
    for (const keyword of flow.triggerKeywords) {
      if (lowerText === keyword.toLowerCase().trim()) {
        return flow;
      }
    }
  }

  return null;
}

/**
 * Start a new chatbot flow for a conversation.
 */
async function startFlow(
  waAccountId: string,
  conversation: IConversation,
  contact: IContact,
  flow: IChatbotFlow,
  io: any
): Promise<void> {
  if (!flow.startNodeId || flow.nodes.length === 0) {
    logger.warn(`Flow ${flow.name} has no start node or nodes`);
    return;
  }

  // Set bot state
  conversation.botState = {
    flowId: flow._id.toString(),
    currentNodeId: flow.startNodeId,
    variables: {},
    startedAt: new Date(),
  };
  await conversation.save();

  // Execute the start node
  const startNode = flow.nodes.find((n) => n.id === flow.startNodeId);
  if (startNode) {
    await executeNode(waAccountId, conversation, contact, flow, startNode, io);
  }
}

/**
 * Continue an existing flow based on user's reply.
 */
async function continueFlow(
  waAccountId: string,
  conversation: IConversation,
  contact: IContact,
  messageText: string,
  io: any
): Promise<void> {
  if (!conversation.botState) return;

  const flow = await ChatbotFlow.findById(conversation.botState.flowId);
  if (!flow || !flow.isActive) {
    // Flow was deactivated — clear state
    conversation.botState = undefined;
    await conversation.save();
    return;
  }

  // Check for keyword interrupt — if user types a keyword for another flow,
  // restart that flow instead of continuing current one
  const keywordFlow = await findKeywordFlow(waAccountId, messageText);
  if (keywordFlow && keywordFlow._id.toString() !== flow._id.toString()) {
    conversation.botState = undefined;
    await conversation.save();
    await startFlow(waAccountId, conversation, contact, keywordFlow, io);
    return;
  }

  const currentNode = flow.nodes.find((n) => n.id === conversation.botState!.currentNodeId);
  if (!currentNode) {
    conversation.botState = undefined;
    await conversation.save();
    return;
  }

  // Determine next node based on current node type and user reply
  let nextNodeId: string | undefined;

  switch (currentNode.type) {
    case 'question': {
      // Store the answer
      if (currentNode.data.variableName) {
        conversation.botState.variables[currentNode.data.variableName] = messageText;

        // Also save to contact's customFields
        contact.customFields.set(currentNode.data.variableName, messageText);
        await contact.save();
      }
      nextNodeId = currentNode.nextNodeId;
      break;
    }

    case 'condition': {
      // Evaluate conditions
      const lowerText = messageText.toLowerCase().trim();
      if (currentNode.data.conditions) {
        for (const cond of currentNode.data.conditions) {
          const condValue = cond.value.toLowerCase().trim();
          let matched = false;

          switch (cond.operator) {
            case 'equals':
              matched = lowerText === condValue;
              break;
            case 'contains':
              matched = lowerText.includes(condValue);
              break;
            case 'startsWith':
              matched = lowerText.startsWith(condValue);
              break;
          }

          if (matched) {
            nextNodeId = cond.nextNodeId;
            break;
          }
        }
      }
      if (!nextNodeId) {
        nextNodeId = currentNode.data.defaultNextNodeId;
      }
      break;
    }

    case 'buttons': {
      // Match button reply
      if (currentNode.data.buttons) {
        const lowerText = messageText.toLowerCase().trim();
        const matchedButton = currentNode.data.buttons.find(
          (btn) => btn.title.toLowerCase().trim() === lowerText || btn.id === messageText
        );
        if (matchedButton) {
          nextNodeId = matchedButton.nextNodeId;
        }
      }
      if (!nextNodeId) {
        nextNodeId = currentNode.nextNodeId;
      }
      break;
    }

    default:
      nextNodeId = currentNode.nextNodeId;
  }

  // Execute next node or complete flow
  if (nextNodeId) {
    const nextNode = flow.nodes.find((n) => n.id === nextNodeId);
    if (nextNode) {
      conversation.botState.currentNodeId = nextNodeId;
      await conversation.save();
      await executeNode(waAccountId, conversation, contact, flow, nextNode, io);
    } else {
      // Node not found — end flow
      await completeFlow(conversation);
    }
  } else {
    // No next node — flow complete
    await completeFlow(conversation);
  }
}

/**
 * Execute a single node in the flow.
 */
async function executeNode(
  waAccountId: string,
  conversation: IConversation,
  contact: IContact,
  flow: IChatbotFlow,
  node: ChatbotNode,
  io: any
): Promise<void> {
  try {
    switch (node.type) {
      case 'message': {
        if (node.data.text) {
          await waService.sendTextMessage(waAccountId, contact.waId, node.data.text, true);
        }
        // Auto-advance to next node after sending message
        if (node.nextNodeId) {
          const nextNode = flow.nodes.find((n) => n.id === node.nextNodeId);
          if (nextNode) {
            conversation.botState!.currentNodeId = node.nextNodeId!;
            await conversation.save();
            // Small delay to avoid rate limiting and let messages arrive in order
            await sleep(500);
            await executeNode(waAccountId, conversation, contact, flow, nextNode, io);
          } else {
            await completeFlow(conversation);
          }
        } else {
          await completeFlow(conversation);
        }
        break;
      }

      case 'question': {
        // Send the question and wait for reply
        if (node.data.question) {
          await waService.sendTextMessage(waAccountId, contact.waId, node.data.question, true);
        }
        // Update current node — next message from user will be captured as answer
        conversation.botState!.currentNodeId = node.id;
        await conversation.save();
        break;
      }

      case 'condition': {
        // Condition nodes wait for user input to evaluate
        // If we reach here without user input, wait
        conversation.botState!.currentNodeId = node.id;
        await conversation.save();
        break;
      }

      case 'buttons': {
        if (node.data.bodyText && node.data.buttons) {
          await waService.sendInteractiveButtons(
            waAccountId,
            contact.waId,
            node.data.bodyText,
            node.data.buttons.map((btn) => ({ id: btn.id, title: btn.title })),
            true
          );
        }
        // Wait for button reply
        conversation.botState!.currentNodeId = node.id;
        await conversation.save();
        break;
      }

      case 'handoff': {
        // Send handoff message and disable bot for this conversation
        if (node.data.handoffMessage) {
          await waService.sendTextMessage(waAccountId, contact.waId, node.data.handoffMessage, true);
        }
        conversation.botDisabled = true;
        conversation.botState = undefined;
        conversation.status = 'pending'; // Flag for human agent
        await conversation.save();

        // Notify agents via Socket.IO
        if (io) {
          io.to(`account:${waAccountId}`).emit('handoff', {
            conversationId: conversation._id.toString(),
            contact: { name: contact.name, waId: contact.waId },
          });
        }
        break;
      }
    }
  } catch (error) {
    logger.error(`Error executing chatbot node ${node.id}:`, error);
    // On error, clear bot state so it doesn't get stuck
    await completeFlow(conversation);
  }
}

/**
 * Complete a flow — clear bot state.
 */
async function completeFlow(conversation: IConversation): Promise<void> {
  conversation.botState = undefined;
  await conversation.save();
  logger.debug(`Flow completed for conversation ${conversation._id}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
