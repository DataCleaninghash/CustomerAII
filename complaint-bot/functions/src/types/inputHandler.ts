/**
 * Types for the input handling module
 */

export interface ComplaintContext {
  rawText: string;
  confidence: number;
  complaintType?: string;
  extractedFields?: Record<string, any>;
  extractedFeatures?: Record<string, any>;
  userDetails?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  imageText?: string;
  originalImage?: string; // Base64 or file path
  imageLabels?: Array<{
    description: string;
    score: number;
    topicality?: number;
  }>;
  imageS3Url?: string;
  audioS3Url?: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  boundingBoxes?: Array<{
    text: string;
    box: [number, number, number, number]; // [x1, y1, x2, y2]
  }>;
  labels?: Array<{
    description: string;
    score: number;
    topicality?: number;
  }>;
}

export interface NLPFeatureExtractionResult {
  features: {
    issueType?: string;
    product?: string;
    service?: string;
    date?: Date;
    location?: string;
    amount?: number;
    [key: string]: any;
  };
  confidence: number;
}

export interface InputHandlerConfig {
  ocrProvider: 'tesseract' | 'google_vision';
  nlpProvider: 'openai' | 'huggingface';
  minConfidence: number;
  apiKeys: {
    openai?: string;
    googleVision?: string;
    huggingface?: string;
  };
}
