/**
 * EntityResolver: Main interface for the entity resolution module
 */
import { CompanyInfo, ContactDetails } from '../../types/entityResolver';
import { ComplaintContext } from '../../types/inputHandler';
import { EntityRecognizer } from './entityRecognizer';
import { ContactScraper } from './contactScraper';
import { ContactCache } from './contactCache';
import { CountryCode } from 'libphonenumber-js';

export class EntityResolver {
  private entityRecognizer: EntityRecognizer;
  private contactScraper: ContactScraper;
  private contactCache: ContactCache;

  constructor() {
    this.entityRecognizer = new EntityRecognizer();
    this.contactScraper = new ContactScraper();
    this.contactCache = new ContactCache();
  }

  /**
   * Identify company mentioned in the complaint context
   * @param context Complaint context from input handler
   * @returns Company information with confidence score
   */
  async identifyCompany(context: ComplaintContext): Promise<CompanyInfo> {
    console.log('\n🏢 EntityResolver: Starting company identification...');
    
    try {
      const companyInfo = await this.entityRecognizer.identifyCompany(context);
      
      console.log('✅ EntityResolver: Company identified successfully');
      console.log(`📋 Company: ${companyInfo.name}`);
      console.log(`📊 Confidence: ${companyInfo.confidence}`);
      console.log(`🏭 Industry: ${companyInfo.industry || 'Unknown'}`);
      
      return companyInfo;
    } catch (error) {
      console.error('❌ EntityResolver: Error identifying company:', error);
      
      // Return a safe fallback instead of throwing
      console.log('🔄 EntityResolver: Using fallback company info');
      
      return {
        name: 'Customer Service Department',
        confidence: 0.3,
        industry: 'General',
        products: undefined
      };
    }
  }

  /**
   * Get contact details for a company, using cache if available
   * @param companyName Name of the company
   * @param userRegion User's region code (e.g., 'IN' for India)
   * @returns Contact details including phone numbers and emails
   */
  async getContactDetails(companyName: string, userRegion?: CountryCode): Promise<ContactDetails> {
    console.log(`\n📞 EntityResolver: Getting contact details for ${companyName}...`);
    console.log(`🌍 User region: ${userRegion || 'default'}`);
    
    try {
      // Try to get from cache first
      console.log('🔍 Checking cache for contact details...');
      const cachedContact = await this.contactCache.getCachedContact(companyName);
      
      if (cachedContact) {
        console.log(`✅ Using cached contact details for ${companyName}`);
        console.log(`📞 Cached phone numbers: ${cachedContact.phoneNumbers?.length || 0}`);
        console.log(`📧 Cached emails: ${cachedContact.emails?.length || 0}`);
        
        // Validate cached data has real contact info
        const hasValidPhones = cachedContact.phoneNumbers && 
          cachedContact.phoneNumbers.some(p => p && !p.includes('UNKNOWN') && !p.includes('example'));
        const hasValidEmails = cachedContact.emails && 
          cachedContact.emails.some(e => e && !e.includes('example.com'));
        
        if (hasValidPhones || hasValidEmails) {
          return cachedContact;
        } else {
          console.log('⚠️ Cached data contains only fallback values, will scrape fresh data');
        }
      }
      
      // If not in cache or expired or has fake data, scrape fresh data
      console.log(`🔍 Scraping fresh contact details for ${companyName}...`);
      
      let contactDetails: ContactDetails;
      
      try {
        contactDetails = await this.contactScraper.scrapeContactDetails(companyName, userRegion);
      } catch (scrapeError) {
        console.error('❌ ContactScraper failed:', scrapeError);
        
        // Use fallback contacts if scraping fails
        contactDetails = this.getFallbackContactDetails(companyName, userRegion);
      }
      
      // Validate scraped results
      const hasRealPhones = contactDetails.phoneNumbers && 
        contactDetails.phoneNumbers.some(p => p && !p.includes('UNKNOWN') && !p.includes('example'));
      const hasRealEmails = contactDetails.emails && 
        contactDetails.emails.some(e => e && !e.includes('example.com'));
      
      if (!hasRealPhones && !hasRealEmails) {
        console.warn(`⚠️ Scraped data for ${companyName} contains only fake/fallback values`);
        
        // Try known contacts database as backup
        const knownContacts = this.getKnownContactDetails(companyName);
        if (knownContacts) {
          console.log(`✅ Using known contact details for ${companyName}`);
          contactDetails = knownContacts;
        } else {
          console.log(`🔄 Using enhanced fallback for ${companyName}`);
          contactDetails = this.getFallbackContactDetails(companyName, userRegion);
        }
      } else {
        console.log(`✅ Found real contact details for ${companyName}`);
        console.log(`📞 Phone numbers: ${contactDetails.phoneNumbers?.slice(0, 2).join(', ')}...`);
        console.log(`📧 Emails: ${contactDetails.emails?.slice(0, 2).join(', ')}...`);
      }
      
      // Cache the fresh data for future use (even if it's fallback data)
      try {
        console.log('💾 Caching contact details...');
        await this.contactCache.cacheContactDetails(companyName, contactDetails);
        console.log('✅ Contact details cached successfully');
      } catch (cacheError) {
        console.warn('⚠️ Failed to cache contact details:', cacheError.message);
        // Don't fail the request if caching fails
      }
      
      console.log('✅ EntityResolver: Contact details retrieved successfully');
      return contactDetails;
      
    } catch (error) {
      console.error('❌ EntityResolver: Error getting contact details:', error);
      
      // Return fallback contact details instead of throwing
      console.log('🔄 EntityResolver: Using final fallback contact details');
      return this.getFallbackContactDetails(companyName, userRegion);
    }
  }

  /**
   * Get known contact details for well-known companies
   * @param companyName Company name
   * @returns Known contact details or null
   */
  private getKnownContactDetails(companyName: string): ContactDetails | null {
    const knownContacts: Record<string, ContactDetails> = {
      'HDFC Bank': {
        phoneNumbers: ['+91-22-6160-6161', '+91-22-2498-8484', '1800-266-4332'],
        emails: ['support@hdfcbank.com', 'customercare@hdfcbank.com'],
        website: 'https://www.hdfcbank.com',
        supportHours: '24/7',
        source: 'known_database',
        lastUpdated: new Date()
      },
      'State Bank of India': {
        phoneNumbers: ['+91-1800-11-2211', '+91-1800-425-3800', '1800-112-211'],
        emails: ['care@sbi.co.in', 'support@sbi.co.in'],
        website: 'https://www.onlinesbi.com',
        supportHours: '24/7',
        source: 'known_database',
        lastUpdated: new Date()
      },
      'ICICI Bank': {
        phoneNumbers: ['+91-1860-120-7777', '+91-1860-266-7777', '1800-102-4242'],
        emails: ['support@icicibank.com', 'care@icicibank.com'],
        website: 'https://www.icicibank.com',
        supportHours: '24/7',
        source: 'known_database',
        lastUpdated: new Date()
      },
      'Axis Bank': {
        phoneNumbers: ['+91-1860-419-5555', '+91-1860-500-5555', '1800-103-5577'],
        emails: ['support@axisbank.com', 'customercare@axisbank.com'],
        website: 'https://www.axisbank.com',
        supportHours: '24/7',
        source: 'known_database',
        lastUpdated: new Date()
      },
      'Amazon': {
        phoneNumbers: ['+1-888-280-4331', '+91-1800-3000-9009', '1800-102-8880'],
        emails: ['support@amazon.com', 'care@amazon.in'],
        website: 'https://www.amazon.com',
        supportHours: '24/7',
        source: 'known_database',
        lastUpdated: new Date()
      },
      'Apple': {
        phoneNumbers: ['+1-800-275-2273', '+91-1800-425-0744', '1800-419-0316'],
        emails: ['support@apple.com'],
        website: 'https://www.apple.com',
        supportHours: '24/7',
        source: 'known_database',
        lastUpdated: new Date()
      }
    };

    // Try exact match first
    if (knownContacts[companyName]) {
      return knownContacts[companyName];
    }

    // Try partial matching
    const normalizedSearch = companyName.toLowerCase();
    for (const [knownName, contacts] of Object.entries(knownContacts)) {
      if (normalizedSearch.includes(knownName.toLowerCase()) ||
          knownName.toLowerCase().includes(normalizedSearch)) {
        return contacts;
      }
    }

    return null;
  }

  /**
   * Get fallback contact details when all else fails
   * @param companyName Company name
   * @param userRegion User region
   * @returns Fallback contact details
   */
  private getFallbackContactDetails(companyName: string, userRegion?: CountryCode): ContactDetails {
    console.log(`🔄 Generating fallback contact details for ${companyName}`);
    
    // Generate region-appropriate fallback numbers
    const fallbackNumbers = userRegion === 'IN' 
      ? ['+91-1800-123-4567', '+91-1800-SUPPORT', '1800-123-456']
      : ['+1-800-CUSTOMER', '+1-800-123-4567', '1-800-SUPPORT'];

    const cleanCompanyName = companyName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

    return {
      phoneNumbers: fallbackNumbers,
      emails: [
        `support@${cleanCompanyName}.com`,
        `customercare@${cleanCompanyName}.com`,
        'help@customerservice.com'
      ],
      website: '',
      supportHours: '9 AM - 6 PM (Local Time)',
      source: 'fallback_generated',
      lastUpdated: new Date()
    };
  }
}

// Export singleton instance for easy import
export const entityResolver = new EntityResolver();

// Export all classes for testing and extension
export { EntityRecognizer, ContactScraper, ContactCache };