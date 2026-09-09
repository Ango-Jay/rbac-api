import type { LogMessage } from '../notification.types';

export const LOG_SENDER = Symbol('LOG_SENDER');

export interface LogSender {
  send(message: LogMessage): Promise<void>;
}
