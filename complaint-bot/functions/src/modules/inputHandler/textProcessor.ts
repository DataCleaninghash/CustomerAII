/**
 * TextProcessor: Handles text-based complaints
 */
import { NLPFeatureExtractionResult } from '../../types/inputHandler';
import { FeatureExtractor } from './featureExtractor';

export class TextProcessor {
  private featureExtractor: FeatureExtractor;

  constructor(featureExtractor: FeatureExtractor) {
    this.featureExtractor = featureExtractor;
  }

  /**
   * Process a text complaint and extract features
   * @param text The complaint text to process
   * @returns Extracted features and confidence score
   */
  async processText(text: string): Promise<NLPFeatureExtractionResult> {
    if (!text || text.trim().length === 0) {
      return {
        features: {},
        confidence: 0
      };
    }

    try {
      // Clean and normalize the text
      const cleanedText = this.cleanText(text);
      
      // Extract features using the feature extractor
      return await this.featureExtractor.extractFeatures(cleanedText);
    } catch (error) {
      console.error('Error processing text:', error);
      throw new Error(`Failed to process text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean and normalize text for processing
   * @param text Raw text input
   * @returns Cleaned text
   */
  private cleanText(text: string): string {
    // Remove extra whitespace
    let cleaned = text.trim().replace(/\s+/g, ' ');
    
    // Remove special characters that might interfere with NLP
    cleaned = cleaned.replace(/[^\w\s.,!?;:'"()-]/g, ' ');
    
    return cleaned;
  }
}
