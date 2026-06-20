import type { Response } from "express";

export interface ApiSuccessResponse<TData, TMeta = never> {
  success: true;
  data: TData;
  meta?: TMeta;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: readonly ApiErrorDetail[];
  };
}

export function sendSuccess<TData, TMeta = never>(
  response: Response,
  data: TData,
  statusCode = 200,
  meta?: TMeta
): Response<ApiSuccessResponse<TData, TMeta>> {
  const body: ApiSuccessResponse<TData, TMeta> = {
    success: true,
    data,
    ...(meta === undefined ? {} : { meta })
  };

  return response.status(statusCode).json(body);
}

export function sendError(
  response: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: readonly ApiErrorDetail[]
): Response<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  };

  return response.status(statusCode).json(body);
}
