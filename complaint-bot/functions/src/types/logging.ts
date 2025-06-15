/**
 * Types for the logging and notification module
 */

export interface SystemAction {
  timestamp: Date;
  module: string;
  action: string;
  status: 'success' | 'failure' | 'in_progress';
  details: Record<string, any>;
}

export interface UserNotification {
  type: 'status_update' | 'question' | 'resolution' | 'error';
  title: string;
  message: string;
  requiresAction: boolean;
  actionUrl?: string;
}

export interface LoggingConfig {
  detailedLogging: boolean;
  notificationChannels: ('email' | 'sms' | 'push')[];
  emailConfig?: {
    fromAddress: string;
    smtpServer: string;
    smtpPort: number;
    username: string;
    password: string;
  };
  smsConfig?: {
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioPhoneNumber: string;
  };
}
