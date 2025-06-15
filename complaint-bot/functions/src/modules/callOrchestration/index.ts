/**
 * Main interface for the call orchestration module
 */
import { EnhancedComplaintContext } from '../../types/followupQuestions';
import { ContactDetails } from '../../types/entityResolver';
import { CallResult, FallbackResult } from '../../types/callOrchestration';
import { BlandAIClient } from './blandAIClient';
import { TwilioController } from './twilioController';
import { IVRNavigator } from './ivrNavigator';
import { FallbackHandler } from './fallbackHandler';
import { CallManager } from './callManager';

export class CallOrchestrator {
  private callManager: CallManager;

  constructor() {
    this.callManager = new CallManager();
  }

  /**
   * Place a complaint call to customer service
   * @param context Enhanced complaint context
   * @param contactDetails Company contact details
   * @param complaintId ID of the complaint in Firestore
   * @returns Call result with status and details
   */
  async placeComplaintCall(
    context: EnhancedComplaintContext,
    contactDetails: ContactDetails,
    complaintId: string
  ): Promise<CallResult> {
    try {
      return await this.callManager.placeComplaintCall(context, contactDetails, complaintId);
    } catch (error) {
      console.error('Error in call orchestration:', error);
      throw new Error(`Call orchestration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle fallback when AI agent needs additional information
   * @param callSid Twilio call SID
   * @param missingInfo Array of missing information fields
   * @param context Enhanced complaint context
   * @param complaintId ID of the complaint in Firestore
   * @returns Fallback result with user responses
   */
  async handleFallback(
    callSid: string,
    missingInfo: string[],
    context: EnhancedComplaintContext,
    complaintId: string
  ): Promise<FallbackResult> {
    try {
      return await this.callManager.handleFallback(callSid, missingInfo, context, complaintId);
    } catch (error) {
      console.error('Error handling fallback:', error);
      throw new Error(`Fallback handling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance for easy import
export const callOrchestrator = new CallOrchestrator();

// Export all classes for testing and extension
export { BlandAIClient, TwilioController, IVRNavigator, FallbackHandler, CallManager };
