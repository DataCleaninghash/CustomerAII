/**
 * Types for the call orchestration module
 */
import { EnhancedComplaintContext } from './followupQuestions';
import { ContactDetails } from './entityResolver';

export interface CallResult {
  status: 'pending' | 'failed' | 'resolved' | 'escalated' | 'call_failed';
  resolution: string;
  nextSteps: string[];
  callId?: string;
  duration?: number;
  transcript?: string;
  referenceNumber?: string;
  cost?: number;
  ivrInteractions?: any[];
  error?: string;
}

export interface CallTranscript {
  speaker: 'ai_agent' | 'customer_service' | 'user';
  text: string;
  timestamp: number;
}

export interface FallbackResult {
  userResponses: Record<string, string>;
  callResumed: boolean;
  resumeTimestamp: number;
}

export interface IVRNavigationPlan {
  steps: IVRNavigationStep[];
  estimatedDuration: number;
}

export interface IVRNavigationStep {
  action: 'wait' | 'press' | 'say';
  value: string;
  delayMs: number;
  description: string;
}

export interface CallOrchestrationConfig {
  maxCallDurationMinutes: number;
  maxRetries: number;
  fallbackTriggers: string[];
  apiKeys: {
    blandAi: string;
    twilio: {
      accountSid: string;
      authToken: string;
      phoneNumber: string;
    };
  };
}
