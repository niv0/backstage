/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { Logger } from 'winston';
import * as errors from '../errors';
import { getRootLogger } from '../logging';

export type ErrorHandlerOptions = {
  /**
   * Whether error response bodies should show error stack traces or not.
   *
   * If not specified, by default shows stack traces only in development mode.
   */
  showStackTraces?: boolean;

  /**
   * Logger instance to log any 5xx errors.
   *
   * If not specified, the root logger will be used.
   */
  logger?: Logger;
};

/**
 * Express middleware to handle errors during request processing.
 *
 * This is commonly the very last middleware in the chain.
 *
 * Its primary purpose is not to do translation of business logic exceptions,
 * but rather to be a gobal catch-all for uncaught "fatal" errors that are
 * expected to result in a 500 error. However, it also does handle some common
 * error types (such as http-error exceptions) and returns the enclosed status
 * code accordingly.
 *
 * @returns An Express error request handler
 */

export function errorHandler(
  options: ErrorHandlerOptions = {},
): ErrorRequestHandler {
  const showStackTraces =
    options.showStackTraces ?? process.env.NODE_ENV === 'development';

  const logger = (options.logger || getRootLogger()).child({
    type: 'errorHandler',
  });

  /* eslint-disable @typescript-eslint/no-unused-vars */
  return (
    error: Error,
    _request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    if (response.headersSent) {
      // If the headers have already been sent, do not send the response again
      // as this will throw an error in the backend.
      next(error);
      return;
    }

    const status = getStatusCode(error);
    const message = showStackTraces ? error.stack : error.message;

    if (logger && status >= 500) {
      logger.error(error);
    }

    response.status(status).send(message);
  };
}

function getStatusCode(error: Error): number {
  // Look for common http library status codes
  const knownStatusCodeFields = ['statusCode', 'status'];
  for (const field of knownStatusCodeFields) {
    const statusCode = (error as any)[field];
    if (
      typeof statusCode === 'number' &&
      (statusCode | 0) === statusCode && // is whole integer
      statusCode >= 100 &&
      statusCode <= 599
    ) {
      return statusCode;
    }
  }

  // Handle well-known error types
  switch (error.name) {
    case errors.InputError.name:
      return 400;
    case errors.AuthenticationError.name:
      return 401;
    case errors.NotAllowedError.name:
      return 403;
    case errors.NotFoundError.name:
      return 404;
    case errors.ConflictError.name:
      return 409;
    default:
      break;
  }

  // Fall back to internal server error
  return 500;
}
