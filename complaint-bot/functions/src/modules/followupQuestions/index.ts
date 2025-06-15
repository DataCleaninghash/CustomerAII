/**
 * Main interface for the follow-up question flow module
 */
import { ComplaintContext } from '../../types/inputHandler';
import { CompanyInfo } from '../../types/entityResolver';
import { EnhancedComplaintContext } from '../../types/followupQuestions';
import { ConfidenceEvaluator } from './confidenceEvaluator';
import { ConversationManager } from './conversationManager';
import { FollowupHandler } from './followupHandler';

export class FollowupQuestionFlow {
  private conversationManager: ConversationManager;

  constructor() {
    this.conversationManager = new ConversationManager();
  }

  /**
   * Ask follow-up questions to gather missing information
   * @param context Complaint context from input handler
   * @param companyInfo Company information from entity resolver
   * @param complaintId ID of the complaint in Firestore
   * @returns Enhanced complaint context with conversation history
   */
  async askQuestions(
    context: ComplaintContext, 
    companyInfo: CompanyInfo,
    complaintId: string
  ): Promise<EnhancedComplaintContext> {
    try {
      return await this.conversationManager.askQuestions(context, companyInfo, complaintId);
    } catch (error) {
      console.error('Error in follow-up question flow:', error);
      throw new Error(`Failed to process follow-up questions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance for easy import
export const followupQuestionFlow = new FollowupQuestionFlow();

// Export all classes for testing and extension
export {
  ConfidenceEvaluator,
  ConversationManager,
  FollowupHandler
};
