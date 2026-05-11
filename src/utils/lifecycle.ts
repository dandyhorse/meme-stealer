import { LogLevel } from './common/dtos';
import { systemLogger } from './system-logger';

const CRITICAL_ERRORS = ['Not connected', 'disconnect'];

const handleCriticalError = (error: unknown) => {
  const errorString = String(error);
  const isCritical = CRITICAL_ERRORS.some((err) => errorString.includes(err));

  if (isCritical) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'TGCLIENT',
      message: `Критическая ошибка, перезапуск: ${errorString}`,
    });
    process.exit(1);
  }
};

export const registerCriticalErrorHandlers = () => {
  process.on('uncaughtException', handleCriticalError);
  process.on('unhandledRejection', (reason) => {
    const errorString = String(reason);
    if (errorString.includes('TIMEOUT') || errorString.includes('Not connected')) {
      return;
    }
    handleCriticalError(reason);
  });
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
