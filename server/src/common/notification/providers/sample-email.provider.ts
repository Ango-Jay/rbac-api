import { Injectable } from '@nestjs/common';
import type { EmailSender } from '../contracts/email.sender';
import type { EmailMessage } from '../notification.types';

@Injectable()
export class SampleEmailProvider implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    // Dummy provider: replace with a real email provider later.
    void message;
  }
}
