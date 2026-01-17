import axios from 'axios';

import { BaseLogDto, FinishLogDto, LogDto, LogLevel } from './common/dtos';

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

const makePrefix = ({ timestamp, level, path, statusCode, message }: BaseLogDto) => {
  const prefix = `[${formatTS(timestamp)}] [${level.toUpperCase()}]`;

  const additional: string[] = [];

  path ? additional.push(`[${path}]`) : null;
  statusCode ? additional.push(`(${statusCode.toString()})`) : null;
  message ? additional.push(message) : null;

  return additional.length > 0 ? `${prefix}: ${additional.join(' ')}` : `${prefix}:`;
};

const prepareDetails = (details?: any) => {
  let logDetails = '';

  if (details) {
    if (details.error && axios.isAxiosError(details.error)) {
      const { error } = details;

      const errorDetails = {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
      };

      delete details.error;

      logDetails = ` ${JSON.stringify({ errorDetails, details })}`;
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

export const systemLogger = {
  finishLog,
  log,
};
