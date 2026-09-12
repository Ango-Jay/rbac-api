export const ACTIVITY_EVENTS = {
  USER_REGISTERED: 'user.registered',
  EMAIL_OTP_SENT: 'email_otp.sent',
  USER_LOGGED_IN: 'user.logged_in',
  USER_LOGGED_OUT: 'user.logged_out',
  MEMBER_CREATED: 'member.created',
  MEMBER_INVITE_ACCEPTED: 'member.invite_accepted',
} as const;

export type ActivityEvent =
  (typeof ACTIVITY_EVENTS)[keyof typeof ACTIVITY_EVENTS];
