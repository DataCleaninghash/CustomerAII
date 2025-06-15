import { FollowupHandler } from '../followupQuestions/followupHandler';
import { EntityResolver } from '../entityResolver';
import { EnhancedComplaintContext } from '../../types/followupQuestions';
import { getRegionFromPhoneNumber } from '../entityResolver/contactScraper';
import { BlandAIClient } from '../callOrchestration/blandAIClient';
import { db } from '../../config/firebase';
import { callOrchestrator } from '../callOrchestration';
import * as admin from 'firebase-admin';
import * as readline from 'readline';

export class ComplaintProcessor {
  private followupHandler: FollowupHandler;
  private entityResolver: EntityResolver;
  private blandAIClient: BlandAIClient;

  constructor() {
    this.followupHandler = new FollowupHandler();
    this.entityResolver = new EntityResolver();
    this.blandAIClient = new BlandAIClient();
  }

  async processComplaint(userId: string, complaintText: string, contactDetails: { phoneNumbers: string[] }): Promise<{ success: boolean; message: string; callId?: string; nextSteps?: string }> {
    try {
      // Create initial complaint record in Firebase
      const complaintRef = await db.collection('complaints').add({
        userId,
        rawText: complaintText,
        status: 'processing',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const complaintId = complaintRef.id;

      // Extract region from user's phone number
      const userRegion = getRegionFromPhoneNumber(contactDetails.phoneNumbers[0] || '');

      // Get company contact details with user's region
      const updatedContactDetails = await this.entityResolver.getContactDetails(
        complaintText,
        userRegion
      );

      // Initialize complaint context
      let context: EnhancedComplaintContext = {
        originalComplaint: complaintText,
        conversationHistory: [],
        finalConfidence: 0
      };

      // Generate and process follow-up questions
      while (this.followupHandler.shouldAskMoreQuestions(context)) {
        try {
          const question = await this.followupHandler.generateFollowupQuestion(context);
          if (!question) break;

          // Prompt the user for input in the CLI
          const answer = await this.promptUserInput(question);
          
          context = await this.followupHandler.processAnswer(context, question, answer);

          // Update conversation history in Firebase
          await db.collection('complaints').doc(complaintId).update({
            conversationHistory: context.conversationHistory,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          console.error('Error generating follow-up questions:', error);
          break;
        }
      }

      // Use the company's phone number for the Bland AI call
      const companyPhone = updatedContactDetails.phoneNumbers[0] || '';
      const phoneNumber = this.formatPhoneNumber(companyPhone);
      console.log('Company phone number being sent to Bland AI:', phoneNumber);

      // Place the call using Bland AI
      const callResult = await callOrchestrator.placeComplaintCall(
        context,
        updatedContactDetails,
        complaintId
      );

      // Update complaint status in Firebase
      await db.collection('complaints').doc(complaintId).update({
        status: callResult.status,
        callId: callResult.callId,
        resolution: callResult.resolution,
        nextSteps: Array.isArray(callResult.nextSteps) ? callResult.nextSteps.join(', ') : callResult.nextSteps,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Complaint processed successfully',
        callId: callResult.callId,
        nextSteps: Array.isArray(callResult.nextSteps) ? callResult.nextSteps.join(', ') : callResult.nextSteps
      };
    } catch (error) {
      console.error('Error processing complaint:', error);
      return {
        success: false,
        message: `Error processing complaint: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async promptUserInput(question: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  private formatPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing
    if (!cleaned.startsWith('1') && cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    return `+${cleaned}`;
  }
} 