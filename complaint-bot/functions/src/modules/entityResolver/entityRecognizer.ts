/**
 * EntityRecognizer: Identifies company names and products from complaint context
 */
import axios from 'axios';
import { CompanyInfo } from '../../types/entityResolver';
import { ComplaintContext } from '../../types/inputHandler';
import inputHandlerConfig from '../../config/inputHandler.config';
import * as fs from 'fs';
import * as path from 'path';

export class EntityRecognizer {
  constructor() {
    // No need to load companyList.json or keyword matcher
  }

  /**
   * Identify company mentioned in the complaint context
   * @param context Complaint context from input handler
   * @returns Company information with confidence score
   */
  async identifyCompany(context: ComplaintContext): Promise<CompanyInfo> {
    try {
      console.log('🔍 EntityRecognizer: Starting company identification...');
      console.log('📋 Raw text:', context.rawText?.substring(0, 100) + '...');
      
      // Check if company name is already extracted in features
      if (context.extractedFeatures?.companyName) {
        console.log('✅ Company already extracted from features:', context.extractedFeatures.companyName);
        return {
          name: context.extractedFeatures.companyName as string,
          confidence: context.confidence,
          products: context.extractedFeatures.product ? [context.extractedFeatures.product as string] : undefined
        };
      }

      // Only use OpenAI for extraction
      return await this.extractCompanyWithOpenAI(context.rawText || '');
    } catch (error) {
      console.error('❌ Error identifying company:', error);
      // Always return fallback if anything fails
      console.log('🔄 Using fallback company: Customer Service');
      return {
        name: 'Customer Service',
        confidence: 0.3,
        industry: 'General',
        products: undefined
      };
    }
  }

  /**
   * Extract company information using OpenAI (with better error handling)
   * @param text Text to analyze
   * @returns Company information
   */
  private async extractCompanyWithOpenAI(text: string): Promise<CompanyInfo> {
    const openaiHeaders = {
      'Authorization': `Bearer ${inputHandlerConfig.apiKeys.openai}`,
      'Content-Type': 'application/json'
    };

    const prompt = `Extract the company or brand name (e.g., Dell, Amazon, Netflix, etc.) from this customer complaint. If a brand or company is mentioned anywhere (even in the product name), extract it. Always prefer a real company or brand over generic terms like 'Customer Service'.

Return ONLY a JSON object with these exact fields: { "name": "Company Name", "industry": "Industry Type or null", "products": ["product1", "product2"] or null, "confidence": 0.8 }.
If no company or brand is mentioned, return { "name": "Customer Service", "confidence": 0.3 }.

Examples:
Complaint: "I ordered a Dell Inspiron laptop from the company's website."
Extracted: { "name": "Dell", "industry": "Computers", "products": ["Inspiron laptop"], "confidence": 0.95 }

Complaint: "Netflix charged me twice for my subscription."
Extracted: { "name": "Netflix", "industry": "Streaming", "products": ["subscription"], "confidence": 0.95 }

Complaint: "I had an issue with my Amazon order."
Extracted: { "name": "Amazon", "industry": "E-commerce", "products": ["order"], "confidence": 0.9 }

Complaint: "I called customer service but didn't get help."
Extracted: { "name": "Customer Service", "confidence": 0.3 }

Complaint text: "${text.substring(0, 500)}"`;

    try {
      console.log('📤 Sending request to OpenAI...');
      console.log('📝 OpenAI prompt:', prompt);
      console.log('📝 Complaint text:', text);
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a company name extractor. Always return valid JSON with a company name, even if you have to guess.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 200,
        },
        {
          headers: openaiHeaders,
          timeout: 10000 // 10 second timeout
        }
      );

      console.log('📥 OpenAI response received');
      const content = response.data?.choices?.[0]?.message?.content;
      console.log('🟢 Full raw OpenAI response content:', content);
      if (!content) {
        throw new Error('No content in OpenAI response');
      }
      let parsedResult;
      try {
        parsedResult = JSON.parse(content);
      } catch (parseError) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in OpenAI response');
        }
      }
      console.log('✅ Parsed OpenAI result:', parsedResult);
      if (!parsedResult || typeof parsedResult !== 'object' || !parsedResult.name) {
        throw new Error('No company name identified');
      }
      return {
        name: parsedResult.name,
        confidence: typeof parsedResult.confidence === 'number' ? Math.min(Math.max(parsedResult.confidence, 0), 1) : 0.7,
        industry: parsedResult.industry || undefined,
        products: Array.isArray(parsedResult.products) ? parsedResult.products : undefined
      };
    } catch (error) {
      // Log the full Axios error object for debugging
      console.error('❌ Full Axios error object:', error);
      // Log full OpenAI error details
      if (error.response) {
        console.error('❌ OpenAI API error details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
        if (error.response.status === 401 || error.response.status === 429) {
          console.error('❌ OpenAI API key invalid or quota exceeded!');
        }
      } else {
        console.error('❌ OpenAI API error:', error.message);
      }
      // Always return fallback
      console.log('🔄 OpenAI failed, using fallback company: Customer Service');
      return {
        name: 'Customer Service',
        confidence: 0.3,
        industry: 'General',
        products: undefined
      };
    }
  }
}