export interface LogDto {
  level: LogLevel;
  module: string;
  message: string;
  details?: unknown;
}

export interface BaseLogDto {
  timestamp: number;
  level: LogLevel;
  path?: string;
  statusCode?: number;
  message?: string;
}

export enum LogLevel {
  LOG = 'log',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}
