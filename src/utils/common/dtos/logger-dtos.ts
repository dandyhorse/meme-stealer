import { Response } from 'express';

import { RequestExt } from '../interfaces';

// Standard log entry used by systemLogger.log().
// Contains the severity level, source module name, human-readable message,
// and optional details object (can be an Error, Axios error, or plain object).
export interface LogDto {
  level: LogLevel;
  module: string;
  message: string;
  details?: any;
}

// Log entry for the completion of an HTTP request.
// Captures the extended request object (with startTime), response, and any error.
// Used by systemLogger.finishLog() to output request duration and status.
export interface FinishLogDto {
  req: RequestExt;
  res: Response;
  error?: any;
}

// Base fields shared by all log entries.
// Used internally by makePrefix() to construct the formatted log prefix string.
export interface BaseLogDto {
  timestamp: number;
  level: LogLevel;
  path?: string;
  statusCode?: number;
  message?: string;
}

// Severity levels for log messages.
// Maps to corresponding console methods (console.log, console.info, etc.)
// and determines the color of the output in the terminal.
export enum LogLevel {
  LOG = 'log',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}
