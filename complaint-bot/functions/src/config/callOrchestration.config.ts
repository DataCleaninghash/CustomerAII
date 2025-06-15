/**
 * Configuration for the call orchestration module
 */
import dotenv from 'dotenv';

dotenv.config();

export const callOrchestrationConfig = {
  maxCallDurationMinutes: parseInt(process.env.MAX_CALL_DURATION_MINUTES || '15', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2', 10),
  fallbackTriggers: (process.env.FALLBACK_TRIGGERS || 'need more information,cannot proceed,missing details').split(','),
  apiKeys: {
    blandAi: process.env.BLAND_API_KEY || '',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
    }
  }
};

export default callOrchestrationConfig;
