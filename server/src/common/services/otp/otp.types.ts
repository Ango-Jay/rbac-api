export const OTP_PURPOSES = [
  'signup',
  'password_reset',
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export type OtpGenerateParams = {
  identifier: string;
  purpose: OtpPurpose;
  ttlSeconds?: number;
  maxAttempts?: number;
};

export type OtpVerifyParams = {
  identifier: string;
  purpose: OtpPurpose;
  submittedCode: string;
};

export type StoredOtpPayload = {
  codeHash: string;
  attempts: number;
  maxAttempts: number;
};
