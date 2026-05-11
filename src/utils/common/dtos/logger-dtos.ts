export interface LogDto {
  level: LogLevel;
  module: string;
  message: string;
  details?: unknown;
}

export enum LogLevel {
  LOG = 'log',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}
