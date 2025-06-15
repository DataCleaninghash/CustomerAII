import OpenAI from 'openai';
import { EnhancedComplaintContext } from '../../types/followupQuestions';

export class OpenAIClient {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not found in environment variables');
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateFollowupQuestions(prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful customer support assistant that asks relevant follow-up questions to gather necessary information for complaint resolution."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      return response.choices[0].message.content || "I apologize, but I need more information to help you better. Could you please provide more details about your complaint?";
    } catch (error) {
      console.error('Error generating follow-up questions:', error);
      throw new Error('Failed to generate follow-up questions');
    }
  }

  async extractInformation(prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an information extraction assistant that identifies and extracts specific details from text. You should only extract information that is explicitly stated and return it in JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      });

      return response.choices[0].message.content || "{}";
    } catch (error) {
      console.error('Error extracting information:', error);
      return "{}";
    }
  }

  async updateContext(
    context: EnhancedComplaintContext,
    question: string,
    answer: string
  ): Promise<EnhancedComplaintContext> {
    try {
      const prompt = `
        Update the complaint context with the following Q&A:
        Q: ${question}
        A: ${answer}

        Current context:
        ${JSON.stringify(context, null, 2)}

        Provide an updated context that incorporates this new information.
      `;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that updates complaint context based on Q&A interactions."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      const updatedContext = JSON.parse(response.choices[0].message.content?.trim() || '{}');
      return { ...context, ...updatedContext };
    } catch (error) {
      console.error('Error updating context:', error);
      return context; // Return original context if update fails
    }
  }

  async needsMoreInformation(context: EnhancedComplaintContext): Promise<boolean> {
    try {
      const prompt = `
        Analyze the following complaint context and determine if more information is needed.
        Consider:
        1. What information has already been gathered
        2. What critical information is still missing
        3. Whether the information gathered is sufficient to process the complaint

        Original Complaint: ${context.originalComplaint}
        
        Information Gathered:
        ${JSON.stringify(context.extractedFields, null, 2)}

        Conversation History:
        ${context.conversationHistory.map(turn => 
          `Q: ${turn.question}\nA: ${turn.answer}`
        ).join('\n\n')}

        Respond with a JSON object:
        {
          "needsMoreInfo": boolean,
          "reason": "Brief explanation of why more information is needed or not"
        }
      `;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an assistant that analyzes complaint information and determines if more details are needed."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 150
      });

      const result = JSON.parse(response.choices[0].message.content || '{"needsMoreInfo": true}');
      return result.needsMoreInfo;
    } catch (error) {
      console.error('Error determining if more information is needed:', error);
      return true; // Default to asking more questions if there's an error
    }
  }
} 