import axios from 'axios';

import { BaseLogDto, FinishLogDto, LogDto, LogLevel } from './common/dtos';

// ANSI escape codes for colored console output (red for errors, green for success, yellow for info/warn)
const makeRed = (message: string) => `\x1b[31m${message}\x1b[0m`;
const makeGreen = (message: string) => `\x1b[32m${message}\x1b[0m`;
const makeYellow = (message: string) => `\x1b[33m${message}\x1b[0m`;

// Formats a timestamp into a readable string (DD.MM.YYYY HH:MM:SS) in Moscow timezone
const formatTS = (timestamp: number) =>
  Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date(timestamp))
    .replace(/\//g, '.')
    .replace(',', '');

// Builds the standard log prefix: [timestamp] [LEVEL] [module] (statusCode) message
const makePrefix = ({ timestamp, level, path, statusCode, message }: BaseLogDto) => {
  const prefix = `[${formatTS(timestamp)}] [${level.toUpperCase()}]`;

  const additional: string[] = [];

  path ? additional.push(`[${path}]`) : null;
  statusCode ? additional.push(`(${statusCode.toString()})`) : null;
  message ? additional.push(message) : null;

  return additional.length > 0 ? `${prefix}: ${additional.join(' ')}` : `${prefix}:`;
};

// Converts an Error object into a plain object for safe JSON serialization
const serializeError = (err: unknown): object => {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { value: err };
};

// Prepares the details portion of a log entry.
// Handles plain objects, Error instances, and Axios errors specially to extract useful info.
const prepareDetails = (details?: unknown) => {
  let logDetails = '';

  if (details) {
    // Если details сам является Error
    if (details instanceof Error) {
      logDetails = ` ${JSON.stringify({ details: serializeError(details) })}`;
    }
    // Если details — объект с полем error (axios или другой)
    else if (typeof details === 'object' && details !== null && 'error' in details) {
      const detailsObj = details as Record<string, unknown>;

      if (axios.isAxiosError(detailsObj.error)) {
        const error = detailsObj.error;
        const errorDetails = {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        };
        delete detailsObj.error;
        logDetails = ` ${JSON.stringify({ errorDetails, details: detailsObj })}`;
      } else {
        detailsObj.error = serializeError(detailsObj.error);
        logDetails = ` ${JSON.stringify({ details: detailsObj })}`;
      }
    } else {
      logDetails = ` ${JSON.stringify({ details })}`;
    }
  }

  return logDetails;
};

// Main logging function. Formats the message, applies color based on log level, and prints to console.
const log = ({ level, module, message, details }: LogDto) => {
  const logPrefix = makePrefix({ timestamp: Date.now(), level, path: module, message });
  const logDetails = prepareDetails(details);

  let logMessage = logPrefix + logDetails;

  switch (level) {
    case LogLevel.INFO:
    case LogLevel.WARN:
    case LogLevel.DEBUG:
      logMessage = makeYellow(logMessage);
      break;
    case LogLevel.LOG:
      logMessage = makeGreen(logMessage);
      break;
    case LogLevel.ERROR:
      logMessage = makeRed(logMessage);
      break;
  }

  console[level](logMessage);
};

// Logs the completion of an HTTP request (typically used with Express middleware).
// Includes request time, body, and any errors that occurred.
const finishLog = ({ res, req, error }: FinishLogDto) => {
  const level: LogLevel = error ? LogLevel.ERROR : LogLevel.LOG;

  const baseUrl = req.baseUrl !== undefined ? req.baseUrl : '';
  const reqPath = req.path !== '/' ? req.path : '';
  const path = baseUrl + reqPath;

  const prefix = makePrefix({
    timestamp: req.startTime,
    level,
    path,
    statusCode: res.statusCode,
  });

  const details = ` ${JSON.stringify({
    requestTime: (Date.now() - req.startTime) / 1000,
    body: req?.body,
    error,
  })}`;

  let message = prefix + details;

  if (error) {
    message = makeRed(message);
  } else {
    message = makeGreen(message);
  }

  console[level](message);
};

// Exported logger interface containing the main logging methods
export const systemLogger = {
  finishLog,
  log,
};
