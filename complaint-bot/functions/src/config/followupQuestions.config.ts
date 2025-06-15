/**
 * Configuration for the follow-up question flow module
 */
import dotenv from 'dotenv';

dotenv.config();

export default {
  maxQuestions: 4,
  confidenceThreshold: 0.75,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  timeoutSeconds: 30
};
