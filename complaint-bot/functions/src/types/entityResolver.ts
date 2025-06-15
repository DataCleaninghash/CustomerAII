/**
 * Types for the entity resolution module
 */

export interface CompanyInfo {
  name: string;
  confidence: number;
  industry?: string;
  products?: string[];
}

export interface ContactDetails {
  phoneNumbers: string[]; // E.164 format
  emails?: string[];
  website?: string;
  supportHours?: string;
  ivrStructure?: IVRNode[];
  source: 'cache' | 'scrape' | 'serpapi' | 'openai-llm' | 'serpapi_error' | 'openai_error' | 'known_database' | 'fallback_generated';
  lastUpdated: Date;
}

export interface IVRNode {
  prompt: string;
  options: IVROption[];
}

export interface IVROption {
  key: string; // DTMF key to press
  description: string;
  nextNode?: IVRNode;
}

export interface EntityResolverConfig {
  scraperType: 'serpapi' | 'playwright';
  cacheExpirationHours: number;
  apiKeys: {
    serpApi?: string;
  };
}
