/**
 * Configuration for the logging and notification module
 */
import dotenv from 'dotenv';

dotenv.config();

export const loggingConfig = {
  detailedLogging: process.env.DETAILED_LOGGING === 'true',
  notificationChannels: (process.env.NOTIFICATION_CHANNELS || 'email').split(',') as ('email' | 'sms' | 'push')[],
  emailConfig: {
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'notifications@ai-complaint-resolution.com',
    smtpServer: process.env.SMTP_SERVER || 'smtp.example.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    username: process.env.SMTP_USERNAME || '',
    password: process.env.SMTP_PASSWORD || ''
  },
  smsConfig: {
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
  }
};

export default loggingConfig;
