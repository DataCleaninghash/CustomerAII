/**
 * FeatureExtractor: Uses NLP to extract structured information from text
 */
import axios from 'axios';
import { NLPFeatureExtractionResult } from '../../types/inputHandler';
import inputHandlerConfig from '../../config/inputHandler.config';

export class FeatureExtractor {
  /**
   * Extract structured features from text using NLP
   * @param text Text to extract features from
   * @returns Extracted features and confidence score
   */
  async extractFeatures(text: string): Promise<NLPFeatureExtractionResult> {
    try {
      // Determine which NLP provider to use based on configuration
      switch (inputHandlerConfig.nlpProvider) {
        case 'huggingface':
          return await this.extractWithHuggingFace(text);
        case 'openai':
        default:
          return await this.extractWithOpenAI(text);
      }
    } catch (error) {
      console.error('Error extracting features:', error);
      throw new Error(`Failed to extract features: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract features using OpenAI API
   * @param text Text to extract features from
   * @returns Extracted features and confidence
   */
  private async extractWithOpenAI(text: string): Promise<NLPFeatureExtractionResult> {
    if (!inputHandlerConfig.apiKeys.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `
                You are an AI specialized in extracting structured information from customer complaints.
                Extract the following information if present:
                - issueType: The type of issue (e.g., billing error, product defect, service interruption)
                - product: Specific product mentioned
                - service: Specific service mentioned
                - date: When the issue occurred (ISO format if possible)
                - location: Where the issue occurred
                - amount: Any monetary amount mentioned (numeric value only)
                - companyName: The company or business the complaint is about
                
                Also include any other relevant fields that might be specific to this complaint.
                Provide a confidence score between 0 and 1 for your extraction.
                Return ONLY a JSON object with these fields, nothing else.
              `
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${inputHandlerConfig.apiKeys.openai}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Parse the response
      const content = response.data.choices[0].message.content;
      let parsedResult;
      
      try {
        parsedResult = JSON.parse(content);
      } catch (e) {
        // If JSON parsing fails, try to extract JSON from the text
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse OpenAI response as JSON');
        }
      }

      // Extract features and confidence
      const { confidence, ...features } = parsedResult;
      
      return {
        features,
        confidence: typeof confidence === 'number' ? confidence : 0.7
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract features using HuggingFace API
   * @param text Text to extract features from
   * @returns Extracted features and confidence
   */
  private async extractWithHuggingFace(text: string): Promise<NLPFeatureExtractionResult> {
    if (!inputHandlerConfig.apiKeys.huggingface) {
      throw new Error('HuggingFace API key not configured');
    }

    try {
      // In a real implementation, we would use the HuggingFace Inference API
      // For this example, we'll simulate the extraction process
      
      console.log('Extracting features with HuggingFace (simulated)');
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Return simulated result
      // In a real implementation, this would call the HuggingFace API
      return {
        features: {
          issueType: 'billing error',
          product: 'subscription service',
          date: new Date(),
          amount: 99.99
        },
        confidence: 0.85
      };
    } catch (error) {
      console.error('HuggingFace API error:', error);
      throw new Error(`HuggingFace API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
