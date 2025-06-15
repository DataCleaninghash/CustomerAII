/**
 * ConfidenceEvaluator: Assesses confidence in complaint understanding
 */
import { ComplaintContext } from '../../types/inputHandler';
import { CompanyInfo } from '../../types/entityResolver';
import { ConversationTurn } from '../../types/followupQuestions';
import axios from 'axios';
import followupQuestionsConfig from '../../config/followupQuestions.config';

export class ConfidenceEvaluator {
  /**
   * Evaluate confidence based on user's answer to a follow-up question
   * @param question The question that was asked
   * @param answer User's answer to the question
   * @param context Current complaint context
   * @param companyInfo Company information
   * @param expectedInfoFields Fields expected to be extracted from the answer
   * @returns Extracted information and confidence delta
   */
  async evaluateAnswer(
    question: string,
    answer: string,
    context: ComplaintContext,
    companyInfo: CompanyInfo,
    expectedInfoFields: string[]
  ): Promise<{
    extractedInfo: Record<string, any>;
    confidenceDelta: number;
  }> {
    try {
      // Use NLP to extract information from the answer
      return await this.extractInfoWithOpenAI(question, answer, context, companyInfo, expectedInfoFields);
    } catch (error) {
      console.error('Error evaluating answer:', error);
      throw new Error(`Failed to evaluate answer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate overall confidence based on initial context and conversation history
   * @param initialConfidence Initial confidence from context extraction
   * @param conversationHistory History of conversation turns
   * @returns Final confidence score
   */
  calculateOverallConfidence(initialConfidence: number, conversationHistory: ConversationTurn[]): number {
    // Start with initial confidence
    let confidence = initialConfidence;
    
    // Add confidence deltas from conversation
    for (const turn of conversationHistory) {
      confidence += turn.confidenceDelta;
    }
    
    // Cap confidence at 1.0
    return Math.min(1.0, confidence);
  }

  /**
   * Extract information from answer using OpenAI
   * @param question Question that was asked
   * @param answer User's answer
   * @param context Current complaint context
   * @param companyInfo Company information
   * @param expectedInfoFields Fields expected to be extracted
   * @returns Extracted information and confidence delta
   */
  private async extractInfoWithOpenAI(
    question: string,
    answer: string,
    context: ComplaintContext,
    companyInfo: CompanyInfo,
    expectedInfoFields: string[]
  ): Promise<{
    extractedInfo: Record<string, any>;
    confidenceDelta: number;
  }> {
    if (!followupQuestionsConfig.openaiApiKey) {
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
                You are an AI assistant analyzing a user's answer to a follow-up question about their complaint.
                Extract the requested information from their answer and evaluate how much this improves our understanding.
                
                Expected information fields: ${expectedInfoFields.join(', ')}
                
                Return ONLY a JSON object with:
                - extractedInfo: Object containing the extracted information fields
                - confidenceDelta: Number between 0.0 and 0.3 representing how much this answer improves our confidence
                  (0.0 = no new information, 0.1 = some clarification, 0.2 = good information, 0.3 = complete clarification)
              `
            },
            {
              role: 'user',
              content: `
                Original complaint context: ${context.rawText}
                
                Company: ${companyInfo.name}
                
                Question asked: ${question}
                
                User's answer: ${answer}
                
                Please extract the information and evaluate confidence improvement.
              `
            }
          ],
          temperature: 0.2,
          max_tokens: 300
        },
        {
          headers: {
            'Authorization': `Bearer ${followupQuestionsConfig.openaiApiKey}`,
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

      return {
        extractedInfo: parsedResult.extractedInfo || {},
        confidenceDelta: typeof parsedResult.confidenceDelta === 'number' 
          ? Math.min(0.3, Math.max(0, parsedResult.confidenceDelta)) // Ensure between 0 and 0.3
          : 0.1 // Default if not provided
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
