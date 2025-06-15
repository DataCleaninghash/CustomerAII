/**
 * Configuration for the entity resolution module
 */
import dotenv from 'dotenv';

dotenv.config();

export const entityResolverConfig = {
  scraperType: process.env.SCRAPER_TYPE || '',
  cacheExpirationHours: parseInt(process.env.CACHE_EXPIRATION_HOURS || '24', 10),
  apiKeys: {
    serpApi: process.env.SERP_API_KEY,
  }
};

export default entityResolverConfig;
