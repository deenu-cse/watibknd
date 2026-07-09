import { PaginationMeta } from '../types';

/**
 * Parse pagination query parameters with safe defaults.
 */
export function parsePagination(query: {
  page?: string;
  limit?: string;
}): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build pagination metadata from query results.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
