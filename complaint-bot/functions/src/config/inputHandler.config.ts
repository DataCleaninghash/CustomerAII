/**
 * Configuration for the input handling module
 */
import dotenv from 'dotenv';

dotenv.config();

export const inputHandlerConfig = {
  ocrProvider: (process.env.OCR_PROVIDER as 'tesseract' | 'google_vision') || 'tesseract',
  nlpProvider: (process.env.NLP_PROVIDER as 'openai' | 'huggingface') || 'openai',
  minConfidence: parseFloat(process.env.MIN_CONFIDENCE || '0.7'),
  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
    googleVision: process.env.GOOGLE_VISION_API_KEY,
    huggingface: process.env.HUGGINGFACE_API_KEY,
  }
};

export default inputHandlerConfig;
