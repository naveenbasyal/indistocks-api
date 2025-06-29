interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total?: number;
    hasMore?: boolean;
  };
}
import { Response } from "express";

export const sendResponse = <T>(
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data?: T,
  pagination?: ApiResponse["pagination"]
): void => {
  const response: ApiResponse<T> = {
    success,
    message,
    ...(data && { data }),
    ...(pagination && { pagination }),
  };

  if (!success) {
    response.error = message;
  }

  res.status(statusCode).json(response);
};
