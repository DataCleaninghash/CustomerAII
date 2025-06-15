/**
 * ContextBuilder: Combines text and image data into unified context
 */
import { ComplaintContext, NLPFeatureExtractionResult, OCRResult } from '../../types/inputHandler';
import { TextProcessor } from './textProcessor';
import { ImageProcessor } from './imageProcessor';
import { FeatureExtractor } from './featureExtractor';
import inputHandlerConfig from '../../config/inputHandler.config';
import { uploadFileToS3 } from '../s3/s3Uploader';

export class ContextBuilder {
  private textProcessor: TextProcessor;
  private imageProcessor: ImageProcessor;
  private featureExtractor: FeatureExtractor;

  constructor(
    textProcessor: TextProcessor,
    imageProcessor: ImageProcessor,
    featureExtractor: FeatureExtractor
  ) {
    this.textProcessor = textProcessor;
    this.imageProcessor = imageProcessor;
    this.featureExtractor = featureExtractor;
  }

  /**
   * Build a unified complaint context from text and/or image input
   * @param text Optional text input
   * @param image Optional image buffer
   * @returns Unified complaint context
   */
  async buildContext(text?: string, image?: Buffer): Promise<ComplaintContext> {
    if (!text && !image) {
      throw new Error('At least one of text or image must be provided');
    }

    try {
      // Initialize context
      let context: ComplaintContext = {
        rawText: text || '',
        extractedFeatures: {},
        confidence: 0
      };

      // Process image if provided
      let ocrResult: OCRResult | null = null;
      if (image) {
        // Upload image to S3 first
        const s3Url = await uploadFileToS3(image, 'image/jpeg', 'complaint-images');
        context.imageS3Url = s3Url;
        ocrResult = await this.imageProcessor.processImage(image);
        context.imageText = ocrResult.text;
        
        // Save image reference if needed
        const imagePath = await this.imageProcessor.saveImageToDisk(image);
        context.originalImage = imagePath;
        
        // Add image labels if present
        if (ocrResult.labels) {
          context.imageLabels = ocrResult.labels;
        }
        
        // If no text was provided, use OCR text as raw text
        if (!text) {
          context.rawText = ocrResult.text;
        }
      }

      // Combine text and OCR text for feature extraction
      const combinedText = this.combineTexts(context.rawText, context.imageText);
      
      // Extract features from combined text
      const extractionResult = await this.featureExtractor.extractFeatures(combinedText);
      context.extractedFeatures = extractionResult.features;
      
      // Calculate overall confidence
      context.confidence = this.calculateConfidence(
        extractionResult,
        ocrResult,
        !!text,
        !!image
      );

      return context;
    } catch (error) {
      console.error('Error building context:', error);
      throw new Error(`Failed to build context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Intelligently combine text from user input and OCR
   * @param userText Text provided by user
   * @param ocrText Text extracted from image
   * @returns Combined text
   */
  private combineTexts(userText?: string, ocrText?: string): string {
    // If only one text source is available, use it
    if (!userText) return ocrText || '';
    if (!ocrText) return userText;
    
    // Both texts are available, combine them intelligently
    // Check if OCR text is already contained in user text
    if (userText.toLowerCase().includes(ocrText.toLowerCase())) {
      return userText; // User text already contains OCR text
    }
    
    // Otherwise, combine them with a separator
    return `${userText}\n\nAdditional information from image:\n${ocrText}`;
  }

  /**
   * Calculate overall confidence based on available inputs and extraction results
   * @param extractionResult NLP extraction result
   * @param ocrResult OCR result
   * @param hasUserText Whether user provided text
   * @param hasImage Whether user provided image
   * @returns Overall confidence score
   */
  private calculateConfidence(
    extractionResult: NLPFeatureExtractionResult,
    ocrResult: OCRResult | null,
    hasUserText: boolean,
    hasImage: boolean
  ): number {
    // Base confidence from NLP extraction
    let confidence = extractionResult.confidence;
    
    // Adjust based on input sources
    if (hasUserText && hasImage) {
      // Both sources available, potentially higher confidence
      confidence = Math.min(1, confidence * 1.2);
    } else if (hasImage && !hasUserText && ocrResult) {
      // Only image, confidence depends on OCR quality
      confidence = confidence * (ocrResult.confidence || 0.7);
    }
    
    // Check if confidence meets minimum threshold
    if (confidence < inputHandlerConfig.minConfidence) {
      console.warn(`Confidence score ${confidence} is below minimum threshold ${inputHandlerConfig.minConfidence}`);
    }
    
    return confidence;
  }
}
