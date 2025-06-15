/**
 * CallManager: Coordinates the overall call process
 */
import { EnhancedComplaintContext } from '../../types/followupQuestions';
import { ContactDetails } from '../../types/entityResolver';
import { CallResult, CallTranscript, FallbackResult } from '../../types/callOrchestration';
import { BlandAIClient } from './blandAIClient';
import { TwilioController } from './twilioController';
import { IVRNavigator } from './ivrNavigator';
import { FallbackHandler } from './fallbackHandler';
import callOrchestrationConfig from '../../config/callOrchestration.config';
import * as admin from 'firebase-admin';
import twilio from 'twilio';

export class CallManager {
  private blandAIClient: BlandAIClient;
  private twilioController: TwilioController;
  private ivrNavigator: IVRNavigator;
  private fallbackHandler: FallbackHandler;
  private db: FirebaseFirestore.Firestore;
  private twilioClient: any;

  constructor() {
    this.blandAIClient = new BlandAIClient();
    this.twilioController = new TwilioController();
    this.ivrNavigator = new IVRNavigator(this.twilioController);
    this.fallbackHandler = new FallbackHandler(this.twilioController);
    
    // Initialize Firestore if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    this.db = admin.firestore();
    this.twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
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
      // Place the call using Twilio and the new TwiML endpoint
      const call = await this.twilioClient.calls.create({
        to: contactDetails.phoneNumbers[0],
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${process.env.PUBLIC_URL}/twiml-entrypoint`,
        method: 'POST'
      });
      // Update the complaint status in Firestore
      const callResult: CallResult = {
        status: 'resolved',
        callId: call.sid,
        resolution: 'Call initiated successfully',
        nextSteps: ['Awaiting customer service response']
      };
      await this.updateComplaintStatus(complaintId, callResult);
      return callResult;
    } catch (error) {
      console.error('Error placing complaint call:', error);
      
      // Handle retries if configured
      if (await this.shouldRetryCall(complaintId)) {
        console.log('Retrying call...');
        return this.placeComplaintCall(context, contactDetails, complaintId);
      }
      
      // If no retry or retries exhausted, return failure
      const failureResult: CallResult = {
        status: 'failed',
        callId: 'failed_call',
        resolution: `Call failed: ${error instanceof Error ? error.message : String(error)}`,
        nextSteps: []
      };
      
      // Update complaint status
      await this.updateComplaintStatus(complaintId, failureResult);
      
      return failureResult;
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
      return await this.fallbackHandler.handleFallback(
        callSid,
        context,
        missingInfo,
        complaintId
      );
    } catch (error) {
      console.error('Error handling fallback:', error);
      throw new Error(`Fallback handling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a call should be retried
   * @param complaintId ID of the complaint
   * @returns Whether to retry the call
   */
  private async shouldRetryCall(complaintId: string): Promise<boolean> {
    try {
      // Get the complaint document
      const complaintDoc = await this.db.collection('complaints').doc(complaintId).get();
      
      if (!complaintDoc.exists) {
        return false;
      }
      
      const complaintData = complaintDoc.data();
      
      // Check retry count against max retries
      const retryCount = complaintData?.retryCount || 0;
      
      if (retryCount >= callOrchestrationConfig.maxRetries) {
        return false;
      }
      
      // Increment retry count
      await this.db.collection('complaints').doc(complaintId).update({
        retryCount: admin.firestore.FieldValue.increment(1),
        lastRetryAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return true;
    } catch (error) {
      console.error('Error checking retry status:', error);
      return false;
    }
  }

  /**
   * Update complaint status based on call result
   * @param complaintId ID of the complaint
   * @param callResult Result of the call
   */
  private async updateComplaintStatus(complaintId: string, callResult: CallResult): Promise<void> {
    try {
      await this.db.collection('complaints').doc(complaintId).update({
        status: callResult.status,
        resolution: callResult.resolution || null,
        nextSteps: callResult.nextSteps || ['Awaiting customer service response'],
        lastCallId: callResult.callId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating complaint status:', error);
      // Non-critical error, just log it
    }
  }

  /**
   * Get current status of a call
   * @param callId Twilio call SID
   * @returns Call status information
   */
  async getCallStatus(callId: string): Promise<any> {
    try {
      return await this.twilioClient.calls(callId).fetch();
    } catch (error) {
      console.error('Error getting call status:', error);
      throw new Error(`Failed to get call status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
