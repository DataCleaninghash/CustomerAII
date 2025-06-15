/**
 * InputHandler: Main interface for the input handling module
 */
import { ComplaintContext } from '../../types/inputHandler';
import { TextProcessor } from './textProcessor';
import { ImageProcessor } from './imageProcessor';
import { FeatureExtractor } from './featureExtractor';
import { ContextBuilder } from './contextBuilder';

export class InputHandler {
  private textProcessor: TextProcessor;
  private imageProcessor: ImageProcessor;
  private featureExtractor: FeatureExtractor;
  private contextBuilder: ContextBuilder;

  constructor() {
    this.featureExtractor = new FeatureExtractor();
    this.textProcessor = new TextProcessor(this.featureExtractor);
    this.imageProcessor = new ImageProcessor();
    this.contextBuilder = new ContextBuilder(
      this.textProcessor,
      this.imageProcessor,
      this.featureExtractor
    );
  }

  /**
   * Process a complaint from text and/or image input
   * @param text Optional text complaint
   * @param image Optional image buffer
   * @returns Processed complaint context with extracted features
   */
  async processComplaint(text?: string, image?: Buffer): Promise<ComplaintContext> {
    if (!text && !image) {
      throw new Error('At least one of text or image must be provided');
    }

    try {
      // Build unified context from inputs
      return await this.contextBuilder.buildContext(text, image);
    } catch (error) {
      console.error('Error processing complaint:', error);
      throw new Error(`Failed to process complaint: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance for easy import
export const inputHandler = new InputHandler();

// Export all classes for testing and extension
export { TextProcessor, ImageProcessor, FeatureExtractor, ContextBuilder };
