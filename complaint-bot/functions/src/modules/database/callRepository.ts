import * as admin from 'firebase-admin';
import { CallStatus } from '../../types';

export class CallRepository {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    this.db = admin.firestore();
  }

  async updateCallStatus(callId: string, status: CallStatus): Promise<void> {
    try {
      await this.db.collection('calls').doc(callId).set(status, { merge: true });
    } catch (error) {
      console.error('Error updating call status:', error);
      throw error;
    }
  }

  async getCallStatus(callId: string): Promise<CallStatus | null> {
    try {
      const doc = await this.db.collection('calls').doc(callId).get();
      return doc.exists ? (doc.data() as CallStatus) : null;
    } catch (error) {
      console.error('Error getting call status:', error);
      throw error;
    }
  }
} 