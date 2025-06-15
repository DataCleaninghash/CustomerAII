/**
 * BlandAIClient: Interfaces with Bland AI for voice agent calls
 */
import axios from 'axios';
import { EnhancedComplaintContext } from '../../types/followupQuestions';
import { ContactDetails } from '../../types/entityResolver';
import { CallResult, CallTranscript } from '../../types/callOrchestration';
import callOrchestrationConfig from '../../config/callOrchestration.config';
import * as admin from 'firebase-admin';

interface CallOptions {
  phoneNumber: string;
  context: EnhancedComplaintContext;
}

interface BlandAIResponse {
  call_id: string;
  status: string;
}

export class BlandAIClient {
  private db: FirebaseFirestore.Firestore;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    // Initialize Firestore if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    this.db = admin.firestore();
    this.apiKey = process.env.BLAND_AI_API_KEY || '';
    this.baseUrl = 'https://api.bland.ai/v1';
    
    if (!this.apiKey) {
      throw new Error('Bland AI API key not found in environment variables');
    }
  }

  /**
   * Place an outbound call using Bland AI
   * @param options Call options including phone number and context
   * @returns Call result with status and details
   */
  async placeCall(options: CallOptions): Promise<CallResult> {
    const { phoneNumber, context } = options;
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.startsWith('+')) {
      throw new Error('A valid E.164 formatted phone number is required');
    }
    try {
      const task = this.constructPrompt(context, { phoneNumbers: [phoneNumber], emails: [], website: '', source: 'serpapi', lastUpdated: new Date() });
      const response = await fetch(`${this.baseUrl}/calls`, {
        method: 'POST',
          headers: {
          'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          task: task
        })
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {}
        console.error(`Bland AI API error: ${response.status} ${response.statusText}\n${errorBody}`);
        throw new Error(`Bland AI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as BlandAIResponse;
      return {
        status: 'resolved',
        callId: data.call_id,
        resolution: 'Call initiated successfully',
        nextSteps: ['Awaiting customer service response']
      };
    } catch (error) {
      console.error('Error placing call:', error);
      return {
        status: 'failed',
        callId: 'error',
        resolution: error instanceof Error ? error.message : 'Unknown error occurred',
        nextSteps: []
      };
    }
  }

  /**
   * Construct a prompt for the Bland AI agent
   * @param context Enhanced complaint context
   * @param contactDetails Company contact details
   * @returns Formatted prompt for the AI agent
   */
  private constructPrompt(context: EnhancedComplaintContext, contactDetails: ContactDetails): string {
    // Extract key information
    const companyName = context.company || 'the company';
    const issueType = context.issue || 'issue';
    const product = context.product || 'product/service';
    const userName = context.customerDetails?.name || 'the customer';
    
    // Construct the prompt
    return `
      You are calling ${companyName}'s customer service on behalf of ${userName}.
      
      The customer has the following complaint about their ${product}:
      "${context.originalComplaint}"
      
      Additional context from our conversation with the customer:
      ${context.conversationHistory.map(turn => `- ${turn.question} ${turn.answer}`).join('\n')}
      
      Your goal is to:
      1. Explain the ${issueType} clearly and professionally
      2. Get a resolution or clear next steps for the customer
      3. If they offer a refund or credit, accept it on behalf of the customer
      4. Get a reference or confirmation number if possible
      5. Thank them for their help
      
      If they ask for information you don't have, say you'll need to check with the customer and will call back.
    `.trim();
  }

  /**
   * Store initial call details in Firestore
   * @param complaintId ID of the complaint
   * @param callId ID of the call
   * @param status Initial call status
   * @param prompt Prompt used for the call
   */
  private async storeCallDetails(
    complaintId: string,
    callId: string,
    status: string,
    prompt: string
  ): Promise<void> {
    try {
      await this.db.collection(`complaints/${complaintId}/calls`).doc(callId).set({
        callId,
        provider: 'bland_ai',
        status,
        prompt,
        startTime: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error storing call details:', error);
      // Non-critical error, just log it
    }
  }

  /**
   * Update call details in Firestore
   * @param complaintId ID of the complaint
   * @param callId ID of the call
   * @param status Updated call status
   * @param transcript Call transcript
   */
  private async updateCallDetails(
    complaintId: string,
    callId: string,
    status: string,
    transcript?: CallTranscript[]
  ): Promise<void> {
    try {
      await this.db.collection(`complaints/${complaintId}/calls`).doc(callId).update({
        status,
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        transcript: transcript || []
      });
    } catch (error) {
      console.error('Error updating call details:', error);
      // Non-critical error, just log it
    }
  }
}
