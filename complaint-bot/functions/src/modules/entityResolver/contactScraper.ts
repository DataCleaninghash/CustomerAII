import axios from 'axios';
import { ContactDetails } from '../../types/entityResolver';
import entityResolverConfig from '../../config/entityResolver.config';
import OpenAI from 'openai';
import { findPhoneNumbersInText, parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

// Utility: Extract base domain from a URL
function extractBaseDomain(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return u.hostname;
  } catch {
    return null;
  }
}

// Trusted domain logic
function isTrustedDomain(url: string, companyName: string): boolean {
  if (!url) return false;
  companyName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const domain = extractBaseDomain(url) || '';
  return domain.includes(companyName);
}

// Phone number scoring function
function scorePhoneNumber(phoneText: string, fullText: string): number {
  let score = 0;
  const lowerText = fullText.toLowerCase();
  const lowerPhone = phoneText.toLowerCase();
  
  // High priority: customer service indicators
  if (lowerText.includes('customer service') || lowerText.includes('customer support')) score += 50;
  if (lowerText.includes('toll-free') || lowerText.includes('free of charge')) score += 30;
  if (lowerText.includes('support') || lowerText.includes('help')) score += 20;
  if (lowerText.includes('contact us') || lowerText.includes('call us')) score += 15;
  
  // Phone number format preferences
  if (phoneText.match(/^(\+?1[-.\s]?)?\(?8[0-9]{2}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/)) score += 25; // US toll-free
  if (phoneText.match(/^1-?800/)) score += 20; // 1-800 numbers
  if (phoneText.match(/^\+?1/)) score += 15; // US numbers
  if (phoneText.match(/^\([0-9]{3}\)/)) score += 10; // (XXX) format
  
  // Negative scoring for non-customer service numbers
  if (lowerText.includes('headquarters') || lowerText.includes('head office')) score -= 30;
  if (lowerText.includes('corporate') || lowerText.includes('investor')) score -= 20;
  if (lowerText.includes('media') || lowerText.includes('press')) score -= 15;
  if (phoneText.match(/^\+[^1]/)) score -= 10; // International non-US numbers (lower priority)
  
  return score;
}

export class ContactScraper {
  private openai: OpenAI | null = null;

  constructor() {
    // Only initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      try {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        console.log('✅ ContactScraper: OpenAI initialized');
      } catch (error) {
        console.warn('⚠️ ContactScraper: Failed to initialize OpenAI:', error.message);
        this.openai = null;
      }
    } else {
      console.log('⚠️ ContactScraper: No OpenAI API key found');
    }
  }

  async scrapeContactDetails(companyName: string, region?: CountryCode): Promise<ContactDetails> {
    console.log(`🔍 ContactScraper: Starting scrape for ${companyName} (region: ${region || 'default'})`);
    
    try {
      // Try SERP API first if available
      if (entityResolverConfig.apiKeys?.serpApi) {
        console.log('🔍 Trying SERP API...');
        const serpResult = await this.scrapeWithSerpApi(companyName, region);
        
        // Check if we have real customer service numbers
        const hasRealNumber = serpResult.phoneNumbers &&
          serpResult.phoneNumbers.some(n => n && n !== '1-800-UNKNOWN' && n !== '' && !n.includes('UNKNOWN'));
        const hasRealEmail = serpResult.emails && 
          serpResult.emails.some(e => e && !e.includes('example.com'));

        if (hasRealNumber || hasRealEmail) {
          console.log('✅ SERP API returned useful contact information');
          return serpResult;
        }

        console.log('⚠️ SERP API returned only fallback/fake contact info');
      } else {
        console.log('⚠️ SERP API key not configured');
      }

      // Fallback to LLM if SERP didn't work or returned fake data
      if (this.openai) {
        console.log('🤖 Falling back to OpenAI LLM...');
        const llmResult = await this.scrapeWithLLM(companyName);
        
        // Check if LLM provided real data
        const hasRealLLMNumber = llmResult.phoneNumbers &&
          llmResult.phoneNumbers.some(n => n && n !== '1-800-UNKNOWN' && !n.includes('UNKNOWN'));
        const hasRealLLMEmail = llmResult.emails && 
          llmResult.emails.some(e => e && !e.includes('example.com'));

        if (hasRealLLMNumber || hasRealLLMEmail) {
          console.log('✅ OpenAI LLM provided useful contact information');
          return llmResult;
        }

        console.log('⚠️ OpenAI LLM also returned only fallback data');
      } else {
        console.log('⚠️ OpenAI not available for LLM fallback');
      }

      // If both failed, return safe fallback
      console.log('🔄 All scraping methods failed, using safe fallback');
      return this.getSafeFallbackContacts(companyName, region);

    } catch (error) {
      console.error('❌ ContactScraper: Error during scraping:', error);
      
      // Always return safe fallback, never throw
      return this.getSafeFallbackContacts(companyName, region);
    }
  }

  private async scrapeWithSerpApi(companyName: string, region?: CountryCode): Promise<ContactDetails> {
    try {
      const params = {
        q: `${companyName} customer service contact email phone number`,
        api_key: entityResolverConfig.apiKeys.serpApi,
        engine: 'google',
        hl: 'en',
        gl: region ? region.toLowerCase() : 'us',
      };
      
      console.log('📤 Making SERP API request...');
      const response = await axios.get('https://serpapi.com/search', { 
        params,
        timeout: 15000 // 15 second timeout
      });
      
      console.log('📥 SERP API response received');
      
      // Store phone numbers with their context for scoring
      const phoneWithContext: Array<{phone: string, context: string, score: number}> = [];
      let emails: string[] = [];
      let website = '';

      // 1. Structured fields (lower priority for customer service)
      if (response.data.knowledge_graph) {
        const kg = response.data.knowledge_graph;
        if (kg.phone) {
          const phones = this.extractPhoneNumbers(kg.phone, region);
          phones.forEach(phone => {
            phoneWithContext.push({
              phone,
              context: 'knowledge_graph',
              score: scorePhoneNumber(phone, 'knowledge graph')
            });
          });
        }
        if (kg.email) emails.push(...this.extractEmails(kg.email));
        if (kg.website) website = kg.website;
      }

      if (response.data.answer_box) {
        const ab = response.data.answer_box;
        if (ab.phone) {
          const phones = this.extractPhoneNumbers(ab.phone, region);
          phones.forEach(phone => {
            phoneWithContext.push({
              phone,
              context: ab.answer || 'answer_box',
              score: scorePhoneNumber(phone, ab.answer || 'answer box')
            });
          });
        }
        if (ab.email) emails.push(...this.extractEmails(ab.email));
        if (ab.link) website = ab.link;
        if (ab.answer) {
          const phones = this.extractPhoneNumbers(ab.answer, region);
          phones.forEach(phone => {
            phoneWithContext.push({
              phone,
              context: ab.answer,
              score: scorePhoneNumber(phone, ab.answer)
            });
          });
          emails.push(...this.extractEmails(ab.answer));
        }
      }

      // 2. Organic results - PRIORITIZE CUSTOMER SERVICE CONTENT
      if (Array.isArray(response.data.organic_results)) {
        for (const result of response.data.organic_results) {
          const fromTrusted = result.link && isTrustedDomain(result.link, companyName);
          const fullContext = `${result.title || ''} ${result.snippet || ''} ${result.link || ''}`;
          
          // Extract phones with context
          for (const field of ['snippet', 'title']) {
            if (result[field]) {
              const phones = this.extractPhoneNumbers(result[field], region);
              phones.forEach(phone => {
                const contextScore = scorePhoneNumber(phone, fullContext);
                const trustScore = fromTrusted ? 10 : 0;
                phoneWithContext.push({
                  phone,
                  context: fullContext,
                  score: contextScore + trustScore
                });
              });
              emails.push(...this.extractEmails(result[field]));
            }
          }
          
          // Prefer customer service pages for website
          if (result.link && /contact|support|help|customer-service/i.test(result.link) && !website) {
            website = result.link;
          }
        }
      }

      // 3. Related questions - HIGH PRIORITY for customer service numbers
      if (Array.isArray(response.data.related_questions)) {
        for (const rq of response.data.related_questions) {
          if (rq.title || rq.snippet) {
            const fullContext = `${rq.title || ''} ${rq.snippet || ''}`;
            const phones = this.extractPhoneNumbers(fullContext, region);
            phones.forEach(phone => {
              phoneWithContext.push({
                phone,
                context: fullContext,
                score: scorePhoneNumber(phone, fullContext) + 20 // Bonus for related questions
              });
            });
            emails.push(...this.extractEmails(fullContext));
          }
        }
      }

      // Sort phones by score (highest first) and deduplicate
      const uniquePhones = new Map<string, {phone: string, context: string, score: number}>();
      phoneWithContext.forEach(item => {
        const normalizedPhone = item.phone.replace(/\s+/g, '');
        if (!uniquePhones.has(normalizedPhone) || uniquePhones.get(normalizedPhone)!.score < item.score) {
          uniquePhones.set(normalizedPhone, item);
        }
      });

      const sortedPhones = Array.from(uniquePhones.values())
        .sort((a, b) => b.score - a.score)
        .map(item => item.phone)
        .filter(p => p && p.length > 5);

      console.log('📊 Phone scoring results:');
      Array.from(uniquePhones.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .forEach(item => {
          console.log(`  ${item.phone} (Score: ${item.score})`);
        });

      // Deduplicate emails
      const uniqueEmails = [...new Set(emails)]
        .filter(e => e && !e.includes('example.com'))
        .filter(e => {
          // Prefer customer service emails
          const lowerEmail = e.toLowerCase();
          return lowerEmail.includes('customer') || 
                 lowerEmail.includes('support') || 
                 lowerEmail.includes('service') ||
                 !lowerEmail.includes('press') && !lowerEmail.includes('media');
        });

      console.log(`📞 Extracted ${sortedPhones.length} phone numbers`);
      console.log(`📧 Extracted ${uniqueEmails.length} emails`);

      // Use real numbers if found, otherwise use fallback
      const finalPhones = sortedPhones.length > 0 ? sortedPhones : ['1-800-UNKNOWN'];
      const finalEmails = uniqueEmails.length > 0 ? uniqueEmails : ['support@example.com'];

      return {
        phoneNumbers: finalPhones,
        emails: finalEmails,
        website,
        supportHours: '24/7',
        source: 'serpapi',
        lastUpdated: new Date()
      };
      
    } catch (error) {
      console.error('❌ SerpAPI error:', error.message);
      
      // Return safe fallback instead of throwing
      return {
        phoneNumbers: ['1-800-UNKNOWN'],
        emails: ['support@example.com'],
        website: '',
        supportHours: '9 AM - 6 PM',
        source: 'serpapi_error',
        lastUpdated: new Date()
      };
    }
  }

  private async scrapeWithLLM(companyName: string): Promise<ContactDetails> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    try {
      const prompt = `Find the official customer service phone number, email address, and physical address for the company named "${companyName}". Focus on customer service contact information, not corporate headquarters. Return only a JSON object with keys: phoneNumbers (array), emails (array), addresses (array of strings), website (string, if available).`;
      
      console.log('📤 Making OpenAI request...');
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for extracting company contact details. Focus on customer service contacts, not corporate offices.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.2
      });
      
      console.log('📥 OpenAI response received');
      
      const content = response.choices[0].message.content;
      let parsed;
      
      try {
        parsed = JSON.parse(content || '{}');
      } catch (e) {
        const jsonMatch = content?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse LLM response as JSON');
        }
      }
      
      return {
        phoneNumbers: Array.isArray(parsed.phoneNumbers) ? parsed.phoneNumbers : ['1-800-UNKNOWN'],
        emails: Array.isArray(parsed.emails) ? parsed.emails : ['support@example.com'],
        website: parsed.website || '',
        supportHours: '24/7',
        source: 'openai-llm',
        lastUpdated: new Date()
      };
      
    } catch (error) {
      console.error('❌ OpenAI LLM error:', error.message);
      
      // Return safe fallback instead of throwing
      return {
        phoneNumbers: ['1-800-UNKNOWN'],
        emails: ['support@example.com'],
        website: '',
        supportHours: '9 AM - 6 PM',
        source: 'openai_error',
        lastUpdated: new Date()
      };
    }
  }

  private extractPhoneNumbers(text: string, region?: CountryCode): string[] {
    try {
      // First try with region
      let found = findPhoneNumbersInText(text, region);
      if (!found.length && !region) {
        found = findPhoneNumbersInText(text);
      }
      
      // Also extract common patterns that libphonenumber might miss
      const manualPatterns = [
        /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // (XXX) XXX-XXXX
        /1[-.\s]?800[-.\s]?\d{3}[-.\s]?\d{4}/g, // 1-800-XXX-XXXX
        /\+\d{1,3}[-.\s]?\d{8,14}/g, // International format
      ];
      
      const manualFound: string[] = [];
      manualPatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          manualFound.push(...matches);
        }
      });
      
      // Combine and clean
      const allNumbers = [
        ...found.map(match => match.number.number),
        ...manualFound
      ];
      
      return allNumbers
        .map(num => num.replace(/[^\d+()-]/g, '')) // Clean but keep formatting
        .filter(num => num.length >= 10) // Minimum length check
        .filter((value, index, arr) => arr.indexOf(value) === index); // Dedupe
        
    } catch (err) {
      console.error('❌ Error extracting phone numbers:', err.message);
      return [];
    }
  }

  private extractEmails(text: string): string[] {
    try {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      return text.match(emailRegex) || [];
    } catch (err) {
      console.error('❌ Error extracting emails:', err.message);
      return [];
    }
  }

  private getSafeFallbackContacts(companyName: string, region?: CountryCode): ContactDetails {
    console.log(`🔄 ContactScraper: Generating safe fallback for ${companyName}`);
    
    const cleanName = companyName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    
    // Generate region-appropriate fallback numbers
    const fallbackNumbers = region === 'IN' 
      ? ['+91-1800-123-4567', '+91-1800-SUPPORT', '1800-123-456']
      : ['+1-800-CUSTOMER', '+1-800-123-4567', '1-800-SUPPORT'];

    return {
      phoneNumbers: fallbackNumbers,
      emails: [
        `support@${cleanName}.com`,
        `customercare@${cleanName}.com`,
        'help@customerservice.com'
      ],
      website: '',
      supportHours: '9 AM - 6 PM (Local Time)',
      source: 'fallback_generated',
      lastUpdated: new Date()
    };
  }
}

export function getRegionFromPhoneNumber(phone: string): CountryCode | undefined {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone);
    return phoneNumber?.country;
  } catch {
    return undefined;
  }
}