/**
 * ContactCache: Caches previously resolved contact information
 */
import { ContactDetails } from '../../types/entityResolver';
import entityResolverConfig from '../../config/entityResolver.config';
import { db, admin } from '../../config/firebase';
import * as fs from 'fs';

export class ContactCache {
  private db: FirebaseFirestore.Firestore;
  
  constructor() {
    this.db = db;
  }

  /**
   * Get cached contact details for a company
   * @param companyName Name of the company
   * @returns Contact details if found and not expired, null otherwise
   */
  async getCachedContact(companyName: string): Promise<ContactDetails | null> {
    try {
      // Normalize company name for consistent lookup
      const normalizedName = this.normalizeCompanyName(companyName);
      
      // Get company document from Firestore
      const companyDoc = await this.db.collection('companies').doc(normalizedName).get();
      
      if (!companyDoc.exists) {
        return null; // No cached data
      }
      
      const companyData = companyDoc.data() as ContactDetails & { lastUpdated: FirebaseFirestore.Timestamp };
      
      // Check if cache has expired
      const lastUpdated = companyData.lastUpdated.toDate();
      const expirationTime = new Date(lastUpdated.getTime() + (entityResolverConfig.cacheExpirationHours * 60 * 60 * 1000));
      
      if (new Date() > expirationTime) {
        console.log(`Cache expired for ${companyName}`);
        return null; // Cache expired
      }
      
      // Convert Firestore timestamp to Date
      return {
        ...companyData,
        lastUpdated: lastUpdated
      };
    } catch (error) {
      console.error('Error getting cached contact:', error);
      return null; // Return null on error to trigger fresh scrape
    }
  }

  /**
   * Store contact details in cache
   * @param companyName Name of the company
   * @param contactDetails Contact details to cache
   */
  async cacheContactDetails(companyName: string, contactDetails: ContactDetails): Promise<void> {
    try {
      // Normalize company name for consistent storage
      const normalizedName = this.normalizeCompanyName(companyName);
      
      // Store in Firestore
      await this.db.collection('companies').doc(normalizedName).set({
        ...contactDetails,
        name: companyName,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`Cached contact details for ${companyName}`);
    } catch (error) {
      console.error('Error caching contact details:', error);
      // Non-critical error, just log it
    }
  }

  /**
   * Normalize company name for consistent cache keys
   * @param companyName Original company name
   * @returns Normalized company name
   */
  private normalizeCompanyName(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
