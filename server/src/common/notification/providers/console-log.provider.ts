import { Injectable } from '@nestjs/common';
import type { LogSender } from '../contracts/log.sender';
import type { LogMessage } from '../notification.types';

@Injectable()
export class ConsoleLogProvider implements LogSender {
  async send(message: LogMessage): Promise<void> {
    const level = message.level ?? 'log';
    const prefix = message.context ? `[${message.context}] ` : '';
    const text = `${prefix}${message.message}`;

    if (level === 'warn') {
      console.warn(text);
      return;
    }

    if (level === 'error') {
      console.error(text);
      return;
    }

    console.log(text);
  }
}
