import type { EmailMessage } from '../notification.types';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
