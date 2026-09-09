export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export type SmsMessage = {
  to: string;
  body: string;
};

export type LogMessage = {
  level?: 'log' | 'warn' | 'error';
  message: string;
  context?: string;
};
