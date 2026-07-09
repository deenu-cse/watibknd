import { Response } from 'express';
import { ApiResponseShape, PaginatedResponse, PaginationMeta } from '../types';

/**
 * Standardized API response helpers.
 * Every endpoint returns { success, data, message } for consistency.
 */
export class ApiResponse {
  /**
   * Success response with data.
   */
  static success<T>(res: Response, data: T, message = 'Success', statusCode = 200): Response {
    const body: ApiResponseShape<T> = {
      success: true,
      data,
      message,
    };
    return res.status(statusCode).json(body);
  }

  /**
   * Success response for resource creation (201).
   */
  static created<T>(res: Response, data: T, message = 'Created successfully'): Response {
    return ApiResponse.success(res, data, message, 201);
  }

  /**
   * Success response with pagination metadata.
   */
  static paginated<T>(
    res: Response,
    data: T[],
    pagination: PaginationMeta,
    message = 'Success'
  ): Response {
    const body: PaginatedResponse<T> = {
      success: true,
      data,
      message,
      pagination,
    };
    return res.status(200).json(body);
  }

  /**
   * Success response with no data (e.g., delete operations).
   */
  static noContent(res: Response, message = 'Deleted successfully'): Response {
    const body: ApiResponseShape<null> = {
      success: true,
      data: null,
      message,
    };
    return res.status(200).json(body);
  }
}
