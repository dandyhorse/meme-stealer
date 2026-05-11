import axios from 'axios';

import { LogDto, LogLevel } from './common/dtos';

const makeRed = (message: string) => `\x1b[31m${message}\x1b[0m`;
const makeGreen = (message: string) => `\x1b[32m${message}\x1b[0m`;
const makeYellow = (message: string) => `\x1b[33m${message}\x1b[0m`;

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

const makePrefix = ({
  timestamp,
  level,
  path,
  message,
}: {
  timestamp: number;
  level: LogLevel;
  path?: string;
  message?: string;
}) => {
  const prefix = `[${formatTS(timestamp)}] [${level.toUpperCase()}]`;

  const additional: string[] = [];

  path ? additional.push(`[${path}]`) : null;
  message ? additional.push(message) : null;

  return additional.length > 0 ? `${prefix}: ${additional.join(' ')}` : `${prefix}:`;
};

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

export const systemLogger = {
  log,
};
