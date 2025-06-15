import { FallbackResult } from '../../types/callOrchestration';
import { EnhancedComplaintContext } from '../../types/followupQuestions';
import { TwilioController } from './twilioController';
import callOrchestrationConfig from '../../config/callOrchestration.config';

export class FallbackHandler {
  private twilioController: TwilioController;

  constructor(twilioController: TwilioController) {
    this.twilioController = twilioController;
  }

  /**
   * Handle fallback when AI agent needs additional information from user
   */
  async handleFallback(
    callSid: string,
    context: EnhancedComplaintContext,
    missingInfo: string[],
    complaintId: string
  ): Promise<FallbackResult> {
    try {
      console.log(`Handling fallback for call ${callSid}`);
      
      // Put current customer service call on hold
      const holdSuccess = await this.twilioController.placeCallOnHold(callSid);
      if (!holdSuccess) throw new Error('Failed to place call on hold');
      
      // Get user's phone number
      const userPhoneNumber = this.getUserPhoneNumber(context);
      if (!userPhoneNumber) throw new Error('User phone number not available for fallback');
      
      // Call user for missing info
      const fallbackResult = await this.twilioController.callUserForFallback(
        userPhoneNumber,
        missingInfo,
        complaintId
      );
      
      // Resume customer service call
      const resumeSuccess = await this.twilioController.resumeCall(callSid);
      if (!resumeSuccess) throw new Error('Failed to resume call after fallback');
      
      return fallbackResult;
    } catch (error) {
      console.error('Error handling fallback:', error);
      throw new Error(`Fallback handling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect if fallback is needed based on conversation transcript
   */
  detectFallbackNeeded(transcript: { speaker: string; text: string }[]): string[] {
    const recentMessages = transcript
      .filter(entry => entry.speaker === 'customer_service')
      .slice(-3)
      .map(entry => entry.text.toLowerCase());
    
    if (recentMessages.length === 0) return [];
    
    const missingInfo: string[] = [];
    for (const message of recentMessages) {
      for (const trigger of callOrchestrationConfig.fallbackTriggers) {
        if (message.includes(trigger.toLowerCase())) {
          if (message.includes('account')) missingInfo.push('account_number');
          else if (message.includes('order')) missingInfo.push('order_number');
          else if (message.includes('date')) missingInfo.push('purchase_date');
          else if (message.includes('address')) missingInfo.push('shipping_address');
          else missingInfo.push('additional_details');
        }
      }
    }
    return [...new Set(missingInfo)];
  }

  /**
   * Get user's phone number from context
   */
  private getUserPhoneNumber(context: EnhancedComplaintContext): string {
    // First try to get from customer details
    const phoneNumber = context.customerDetails?.phone;
    if (phoneNumber) {
      console.log('Using phone number from customer details:', phoneNumber);
      return phoneNumber;
    }

    // Then try to get from contact details
    const contactPhone = context.contactDetails?.phoneNumbers?.[0];
    if (contactPhone) {
      console.log('Using phone number from contact details:', contactPhone);
      return contactPhone;
    }

    // Log warning if no phone number found
    console.warn('No phone number found in context, using fallback number');
    
    // Fallback to default number
    return '+15551234567';
  }
}
