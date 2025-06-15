interface BlandAIConfig {
  apiKeys: {
    blandAi: string;
    twilio: {
      accountSid: string;
      authToken: string;
      phoneNumber: string;
    };
  };
  maxRetries: number;
  maxCallDurationMinutes: number;
  fallbackTriggers: string[];
}

export class ConfigManager {
  private static config: BlandAIConfig;

  static getConfig(): BlandAIConfig {
    if (!this.config) {
      this.config = {
        apiKeys: {
          blandAi: process.env.BLAND_AI_API_KEY || '',
          twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID || '',
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
          }
        },
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        maxCallDurationMinutes: parseInt(process.env.MAX_CALL_DURATION_MINUTES || '15', 10),
        fallbackTriggers: (process.env.FALLBACK_TRIGGERS || 'need more information,cannot proceed,missing details').split(',')
      };
    }
    return this.config;
  }
} 