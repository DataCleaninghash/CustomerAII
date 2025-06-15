/**
 * Types for the follow-up question flow module
 */
import { ComplaintContext } from './inputHandler';
import { CompanyInfo } from './entityResolver';
import * as admin from 'firebase-admin';

export interface EnhancedComplaintContext {
  originalComplaint: string;
  company?: string;
  product?: string;
  issue?: string;
  priority?: 'low' | 'medium' | 'high';
  customerDetails?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  contactDetails?: {
    phoneNumbers?: string[];
    emails?: string[];
    website?: string;
  };
  additionalContext?: Record<string, any>;
  conversationHistory: ConversationTurn[];
  finalConfidence: number;
  extractedFields?: Record<string, any>;
  complaintType?: string;
  userDetails?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface ConversationTurn {
  id: string;
  question: string;
  answer: string;
  timestamp: Date;
  extractedInfo: Record<string, any>;
  confidenceDelta: number;
}

export interface QuestionFlowConfig {
  maxQuestions: number;
  confidenceThreshold: number;
  timeoutSeconds: number;
}

export interface QuestionGenerationParams {
  context: ComplaintContext;
  companyInfo: CompanyInfo;
  conversationHistory: ConversationTurn[];
  currentConfidence: number;
  gatheredInfo: string[];
}

export interface QuestionGenerationResult {
  question: string;
  isLastQuestion: boolean;
  expectedInfoFields: string[];
  extractedInfo?: Record<string, any>;
  confidenceDelta?: number;
}

// New types for required fields
export interface RequiredField {
  name: string;
  description: string;
  validation?: (value: any) => boolean;
}

export interface ComplaintTypeConfig {
  type: string;
  requiredFields: RequiredField[];
  optionalFields: RequiredField[];
}

// Define complaint types and their required fields
export const COMPLAINT_TYPES: Record<string, ComplaintTypeConfig> = {
  DELIVERY: {
    type: 'DELIVERY',
    requiredFields: [
      { name: 'orderNumber', description: 'Order or tracking number' },
      { name: 'expectedDate', description: 'Expected delivery date' },
      { name: 'currentStatus', description: 'Current delivery status' },
      { name: 'issue', description: 'Specific delivery issue' }
    ],
    optionalFields: [
      { name: 'carrier', description: 'Delivery carrier' },
      { name: 'previousAttempts', description: 'Previous delivery attempts' }
    ]
  },
  PRODUCT: {
    type: 'PRODUCT',
    requiredFields: [
      { name: 'productName', description: 'Name of the product' },
      { name: 'issue', description: 'Product issue description' },
      { name: 'purchaseDate', description: 'Date of purchase' },
      { name: 'orderNumber', description: 'Order number' }
    ],
    optionalFields: [
      { name: 'warranty', description: 'Warranty information' },
      { name: 'previousAttempts', description: 'Previous resolution attempts' }
    ]
  },
  SERVICE: {
    type: 'SERVICE',
    requiredFields: [
      { name: 'serviceType', description: 'Type of service' },
      { name: 'issue', description: 'Service issue description' },
      { name: 'date', description: 'Date of service' },
      { name: 'location', description: 'Service location' }
    ],
    optionalFields: [
      { name: 'previousAttempts', description: 'Previous resolution attempts' },
      { name: 'preferences', description: 'Resolution preferences' }
    ]
  }
};
