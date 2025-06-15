/**
 * IVRNavigator: Navigates through IVR systems
 */
import { IVRNavigationPlan } from '../../types/callOrchestration';
import { ContactDetails } from '../../types/entityResolver';
import { EnhancedComplaintContext } from '../../types/followupQuestions';
import { TwilioController } from './twilioController';

export class IVRNavigator {
  private twilioController: TwilioController;

  constructor(twilioController: TwilioController) {
    this.twilioController = twilioController;
  }

  /**
   * Navigate through an IVR system to reach a human agent
   * @param callSid Twilio call SID
   * @param context Enhanced complaint context
   * @param contactDetails Company contact details
   * @returns Success status
   */
  async navigateToHuman(
    callSid: string,
    context: EnhancedComplaintContext,
    contactDetails: ContactDetails
  ): Promise<boolean> {
    try {
      // Determine the appropriate department based on the complaint
      const targetDepartment = this.determineTargetDepartment(context);
      
      // Generate a navigation plan
      const navigationPlan = this.twilioController.generateIVRNavigationPlan(
        contactDetails.ivrStructure,
        targetDepartment
      );
      
      // Execute the navigation plan
      return await this.twilioController.navigateIVR(callSid, navigationPlan);
    } catch (error) {
      console.error('Error navigating IVR:', error);
      return false;
    }
  }

  /**
   * Determine the appropriate department based on the complaint context
   * @param context Enhanced complaint context
   * @returns Target department name
   */
  private determineTargetDepartment(context: EnhancedComplaintContext): string {
    // Extract issue type from context
    const issueType = context.issue?.toLowerCase() || '';
    
    // Map issue types to departments
    if (issueType.includes('bill') || issueType.includes('charge') || issueType.includes('payment')) {
      return 'billing';
    } else if (issueType.includes('technical') || issueType.includes('error') || issueType.includes('not working')) {
      return 'technical_support';
    } else if (issueType.includes('cancel') || issueType.includes('subscription')) {
      return 'account_management';
    } else if (issueType.includes('refund') || issueType.includes('return')) {
      return 'returns';
    } else {
      return 'general_customer_service';
    }
  }
}
