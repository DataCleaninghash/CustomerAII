/**
 * DatabaseConnector: Interfaces with Firestore
 */
import * as admin from 'firebase-admin';

export class DatabaseConnector {
  private db: FirebaseFirestore.Firestore;
  private static instance: DatabaseConnector;

  private constructor() {
    // Initialize Firestore if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    this.db = admin.firestore();
  }

  /**
   * Get singleton instance
   * @returns DatabaseConnector instance
   */
  public static getInstance(): DatabaseConnector {
    if (!DatabaseConnector.instance) {
      DatabaseConnector.instance = new DatabaseConnector();
    }
    return DatabaseConnector.instance;
  }

  /**
   * Get Firestore instance
   * @returns Firestore instance
   */
  public getFirestore(): FirebaseFirestore.Firestore {
    return this.db;
  }

  /**
   * Create a new complaint record
   * @param complaintData Complaint data
   * @returns Complaint ID
   */
  async createComplaint(complaintData: any): Promise<string> {
    try {
      const complaintRef = this.db.collection('complaints').doc();
      await complaintRef.set({
        ...complaintData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending'
      });
      return complaintRef.id;
    } catch (error) {
      console.error('Error creating complaint:', error);
      throw new Error(`Failed to create complaint: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update a complaint record
   * @param complaintId Complaint ID
   * @param updateData Data to update
   * @returns Success status
   */
  async updateComplaint(complaintId: string, updateData: any): Promise<boolean> {
    if (!complaintId || typeof complaintId !== 'string' || complaintId.trim() === '') {
      console.error('Invalid complaintId provided to updateComplaint:', complaintId);
      return false;
    }
    try {
      await this.db.collection('complaints').doc(complaintId).update({
        ...updateData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating complaint:', error);
      return false;
    }
  }

  /**
   * Get a complaint record
   * @param complaintId Complaint ID
   * @returns Complaint data
   */
  async getComplaint(complaintId: string): Promise<any | null> {
    try {
      const complaintDoc = await this.db.collection('complaints').doc(complaintId).get();
      if (!complaintDoc.exists) {
        return null;
      }
      return complaintDoc.data();
    } catch (error) {
      console.error('Error getting complaint:', error);
      return null;
    }
  }

  /**
   * Add a subcollection document
   * @param complaintId Complaint ID
   * @param subcollection Subcollection name
   * @param data Document data
   * @returns Document ID
   */
  async addSubcollectionDocument(
    complaintId: string,
    subcollection: string,
    data: any
  ): Promise<string> {
    try {
      const docRef = this.db.collection(`complaints/${complaintId}/${subcollection}`).doc();
      await docRef.set({
        ...data,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error(`Error adding ${subcollection} document:`, error);
      throw new Error(`Failed to add ${subcollection} document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get documents from a subcollection
   * @param complaintId Complaint ID
   * @param subcollection Subcollection name
   * @returns Array of documents
   */
  async getSubcollectionDocuments(
    complaintId: string,
    subcollection: string
  ): Promise<any[]> {
    try {
      const snapshot = await this.db
        .collection(`complaints/${complaintId}/${subcollection}`)
        .orderBy('timestamp', 'asc')
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error getting ${subcollection} documents:`, error);
      return [];
    }
  }
}
