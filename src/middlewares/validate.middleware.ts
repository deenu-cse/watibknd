import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../utils/apiError';

/**
 * Validation middleware factory.
 * Validates request body/query/params against a Zod schema.
 *
 * Usage: router.post('/endpoint', validate(mySchema), controller)
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      // Replace with parsed (coerced/transformed) data
      req[source] = data;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors: Record<string, string[]> = {};
        error.errors.forEach((e) => {
          const path = e.path.join('.');
          if (!fieldErrors[path]) {
            fieldErrors[path] = [];
          }
          fieldErrors[path].push(e.message);
        });

        next(ApiError.badRequest('Validation failed', fieldErrors));
      } else {
        next(error);
      }
    }
  };
}
