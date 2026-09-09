import type { SmsMessage } from '../notification.types';

export const SMS_SENDER = Symbol('SMS_SENDER');

export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}
