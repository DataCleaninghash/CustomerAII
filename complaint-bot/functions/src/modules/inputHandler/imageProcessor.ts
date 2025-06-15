/**
 * ImageProcessor: Processes uploaded images using OCR
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { OCRResult } from '../../types/inputHandler';
import inputHandlerConfig from '../../config/inputHandler.config';

export class ImageProcessor {
  /**
   * Process an image and extract text using OCR
   * @param imageBuffer Image buffer or base64 string
   * @returns OCR result with extracted text and confidence
   */
  async processImage(imageBuffer: Buffer | string): Promise<OCRResult> {
    try {
      // Determine which OCR provider to use based on configuration
      switch (inputHandlerConfig.ocrProvider) {
        case 'google_vision':
          return await this.processWithGoogleVision(imageBuffer);
        case 'tesseract':
        default:
          return await this.processWithTesseract(imageBuffer);
      }
    } catch (error) {
      console.error('Error processing image:', error);
      throw new Error(`Failed to process image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process image using Google Vision API
   * @param imageBuffer Image buffer or base64 string
   * @returns OCR result
   */
  private async processWithGoogleVision(imageBuffer: Buffer | string): Promise<OCRResult> {
    if (!inputHandlerConfig.apiKeys.googleVision) {
      throw new Error('Google Vision API key not configured');
    }

    try {
      // Convert buffer to base64 if needed
      const base64Image = Buffer.isBuffer(imageBuffer) 
        ? imageBuffer.toString('base64')
        : imageBuffer;

      // Prepare request to Google Vision API (TEXT_DETECTION and LABEL_DETECTION)
      const response = await axios.post(
        'https://vision.googleapis.com/v1/images:annotate',
        {
          requests: [
            {
              image: {
                content: base64Image
              },
              features: [
                { type: 'TEXT_DETECTION' },
                { type: 'LABEL_DETECTION' }
              ]
            }
          ]
        },
        {
          params: {
            key: inputHandlerConfig.apiKeys.googleVision
          }
        }
      );

      // Process response
      const result = response.data.responses[0];
      // OCR
      let fullText = '';
      let boundingBoxes = [];
      if (result.textAnnotations && result.textAnnotations.length > 0) {
        fullText = result.textAnnotations[0].description;
        boundingBoxes = result.textAnnotations.slice(1).map((annotation: any) => {
          const vertices = annotation.boundingPoly.vertices;
          return {
            text: annotation.description,
            box: [
              vertices[0].x, vertices[0].y, // top-left
              vertices[2].x, vertices[2].y  // bottom-right
            ] as [number, number, number, number]
          };
        });
      }
      // Labels
      let labels = [];
      if (result.labelAnnotations && result.labelAnnotations.length > 0) {
        labels = result.labelAnnotations.map((label: any) => ({
          description: label.description,
          score: label.score,
          topicality: label.topicality
        }));
      }
      return {
        text: fullText,
        confidence: 0.9, // Google Vision doesn't provide confidence scores directly
        boundingBoxes,
        labels
      };
    } catch (error) {
      console.error('Google Vision API error:', error);
      throw new Error(`Google Vision API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process image using Tesseract OCR
   * @param imageBuffer Image buffer or base64 string
   * @returns OCR result
   */
  private async processWithTesseract(imageBuffer: Buffer | string): Promise<OCRResult> {
    // In a real implementation, we would use the tesseract.js library
    // For this example, we'll simulate the OCR process
    
    console.log('Processing with Tesseract OCR (simulated)');
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return simulated result
    // In a real implementation, this would call tesseract.recognize()
    return {
      text: "This is a simulated OCR result. In a real implementation, this would contain the text extracted from the image.",
      confidence: 0.8
    };
  }

  /**
   * Save image to disk for processing or reference
   * @param imageBuffer Image buffer
   * @param filename Optional filename, will generate if not provided
   * @returns Path to saved image
   */
  async saveImageToDisk(imageBuffer: Buffer, filename?: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Generate filename if not provided
    const imageName = filename || `image_${Date.now()}.jpg`;
    const imagePath = path.join(uploadDir, imageName);
    
    // Write file to disk
    fs.writeFileSync(imagePath, imageBuffer);
    
    return imagePath;
  }
}
