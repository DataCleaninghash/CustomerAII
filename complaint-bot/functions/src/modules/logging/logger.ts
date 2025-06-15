/**
 * Logger: Records detailed system actions
 */
import { SystemAction } from '../../types/logging';
import loggingConfig from '../../config/logging.config';
import * as admin from 'firebase-admin';

export class Logger {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    // Initialize Firestore if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    this.db = admin.firestore();
  }

  /**
   * Log a system action
   * @param complaintId ID of the complaint
   * @param action System action to log
   * @returns Success status
   */
  async logAction(
    complaintId: string,
    action: SystemAction
  ): Promise<boolean> {
    try {
      // Add server timestamp if not provided
      if (!action.timestamp) {
        action.timestamp = new Date();
      }

      // Store in Firestore
      await this.db.collection(`complaints/${complaintId}/actions`).add({
        ...action,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        loggedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log to console for debugging
      console.log(`[${action.module}] ${action.action} - ${action.status}`);
      if (loggingConfig.detailedLogging) {
        console.log('Details:', JSON.stringify(action.details));
      }

      return true;
    } catch (error) {
      console.error('Error logging action:', error);
      // Try to log the error itself
      try {
        await this.db.collection(`complaints/${complaintId}/actions`).add({
          module: 'logger',
          action: 'log_error',
          status: 'failure',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: {
            originalModule: action.module,
            originalAction: action.action,
            error: error instanceof Error ? error.message : String(error)
          }
        });
      } catch (secondaryError) {
        console.error('Failed to log error:', secondaryError);
      }

      return false;
    }
  }

  /**
   * Get complaint history
   * @param complaintId ID of the complaint
   * @returns Array of system actions
   */
  async getComplaintHistory(complaintId: string): Promise<SystemAction[]> {
    try {
      const actionsSnapshot = await this.db
        .collection(`complaints/${complaintId}/actions`)
        .orderBy('timestamp', 'asc')
        .get();

      return actionsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          timestamp: data.timestamp?.toDate() || new Date(),
          details: data.details || {}
        } as SystemAction;
      });
    } catch (error) {
      console.error('Error getting complaint history:', error);
      return [];
    }
  }

  /**
   * Get summary of complaint actions
   * @param complaintId ID of the complaint
   * @returns Summary of actions by module and status
   */
  async getActionSummary(complaintId: string): Promise<Record<string, any>> {
    try {
      const actions = await this.getComplaintHistory(complaintId);
      
      // Group by module and status
      const summary: Record<string, Record<string, number>> = {};
      
      for (const action of actions) {
        if (!summary[action.module]) {
          summary[action.module] = {
            success: 0,
            failure: 0,
            in_progress: 0
          };
        }
        
        summary[action.module][action.status]++;
      }
      
      return summary;
    } catch (error) {
      console.error('Error getting action summary:', error);
      return {};
    }
  }
}
