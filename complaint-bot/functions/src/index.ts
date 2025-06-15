/**
 * Main application integrating all modules (API MODE)
 */
import { db, admin } from './config/firebase';
import * as fs from 'fs';
import * as path from 'path';
import { ComplaintContext } from './types/inputHandler';
import { CompanyInfo, ContactDetails } from './types/entityResolver';
import { EnhancedComplaintContext } from './types/followupQuestions';
import { CallResult } from './types/callOrchestration';
import { inputHandler } from './modules/inputHandler';
import { entityResolver } from './modules/entityResolver';
import { followupQuestionFlow } from './modules/followupQuestions';
import { callOrchestrator } from './modules/callOrchestration';
import { loggingSystem } from './modules/logging';
import { SignupService } from './modules/auth/signup';
import { UserSignupData, AuthResponse } from './modules/auth/types';
import { AudioProcessor } from './modules/inputHandler/audioProcessor';
import { uploadFileToS3 } from './modules/s3/s3Uploader';
import { ImageProcessor } from './modules/inputHandler/imageProcessor';
import { ConversationManager } from './modules/followupQuestions/conversationManager';

// Global handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

export class ComplaintResolutionSystem {
  private signupService: SignupService;

  constructor() {
    this.signupService = new SignupService();
  }

  /**
   * Handle user signup
   * @param userData User signup data
   * @returns Result of the signup process
   */
  async signup(userData: UserSignupData): Promise<{ success: boolean; userId: string }> {
    return this.signupService.signup(userData);
  }

  /**
   * Unified complaint processing pipeline (API MODE - NON-BLOCKING)
   * Handles new complaints and follow-ups, all modalities
   */
  async processUnifiedComplaint({
    userId,
    text,
    image,
    audio,
    audioMime,
    isFollowup = false,
    complaintId,
    questionId,
    answer
  }: {
    userId: string;
    text?: string;
    image?: Buffer;
    audio?: Buffer;
    audioMime?: string;
    isFollowup?: boolean;
    complaintId?: string;
    questionId?: string;
    answer?: string;
  }): Promise<any> {
    console.log('\n🚀 API MODE: Starting unified complaint processing...');
    console.log(`📋 Request type: ${isFollowup ? 'FOLLOW-UP' : 'NEW COMPLAINT'}`);
    console.log(`📋 Complaint ID: ${complaintId || 'Will be generated'}`);
    console.log(`📋 User ID: ${userId}`);
    console.log(`📋 Text: ${text || 'None'}`);
    console.log(`📋 Has image: ${!!image}`);
    console.log(`📋 Has audio: ${!!audio}`);

    const conversationManager = new ConversationManager();

    // Harden isFollowup check to handle both boolean and string 'true'
    const isFollowupBool = String(isFollowup) === 'true';
    console.log('🟢 [API] isFollowup:', isFollowup, typeof isFollowup, 'complaintId:', complaintId, 'questionId:', questionId, 'answer:', answer);

    if (isFollowupBool && complaintId && questionId && answer) {
      // --- FOLLOW-UP FLOW ---
      // Debug log: print follow-up identifiers
      console.log('🟢 [Debug] processUnifiedComplaint follow-up:', {
        complaintId,
        questionId,
        answer
      });
      // Only update conversation history and generate next question
      console.log('🔄 [Follow-up] Updating conversation history for complaint:', complaintId);
      try {
        await conversationManager.processAnswer(complaintId, questionId, answer);
      } catch (err) {
        console.error('Follow-up failed, aborting request', err);
        return { success: false, message: 'Could not save your answer, please retry' };
      }
      // Fetch the latest complaint document for context
      const complaintDoc = await db.collection('complaints').doc(complaintId).get();
      if (!complaintDoc.exists) {
        throw new Error(`Complaint document ${complaintId} not found`);
      }
      const complaintData = complaintDoc.data()!;
      // Use the latest context for follow-up question generation
      const context = {
        rawText: complaintData.rawText,
        confidence: complaintData.finalConfidence || 0.5,
        complaintType: complaintData.complaintType || 'GENERAL',
        extractedFeatures: complaintData.extractedFields || {},
      };
      const companyInfo = { name: complaintData.company, confidence: complaintData.finalConfidence || 0.5 };
      const enhancedContext = await followupQuestionFlow.askQuestions(context, companyInfo, complaintId);
      // Prepare the response (similar to before)
      const pendingQuestions = enhancedContext.conversationHistory.filter(turn => !turn.answer || turn.answer === '');
      const hasMoreQuestions = pendingQuestions.length > 0;
      const nextQuestion = hasMoreQuestions ? {
        id: pendingQuestions[0].id,
        question: pendingQuestions[0].question,
        type: 'text' as const
      } : null;
      return {
        success: true,
        complaintId,
        nextQuestion,
        followUpQuestions: pendingQuestions.map((turn) => ({
          id: turn.id,
          question: turn.question,
          type: 'text' as const,
          answer: turn.answer
        })),
        conversationComplete: !hasMoreQuestions,
        totalQuestions: enhancedContext.conversationHistory.length,
        answeredQuestions: enhancedContext.conversationHistory.filter(turn => !!turn.answer && turn.answer !== '').length
      };
    }

    // --- NEW COMPLAINT FLOW ---
    let context: any = {};
    let audioTranscript: string | undefined;
    let audioS3Url: string | undefined;
    let imageS3Url: string | undefined;
    let ocrResult: any = {};
    try {
      // Handle audio: upload to S3 and transcribe
      if (audio && audioMime) {
        console.log('🎵 Processing audio...');
        const audioProcessor = new AudioProcessor();
        const audioResult = await audioProcessor.processAudio(audio, audioMime);
        audioTranscript = audioResult.transcript;
        audioS3Url = audioResult.audioS3Url;
        if (!text) text = audioTranscript;
        console.log('✅ Audio processed:', { audioS3Url, transcript: audioTranscript?.substring(0, 50) + '...' });
      }

      // Handle image: upload to S3 and OCR
      if (image) {
        console.log('🖼️ Processing image...');
        imageS3Url = await uploadFileToS3(image, 'image/jpeg', 'complaint-images');
        const imageProcessor = new ImageProcessor();
        ocrResult = await imageProcessor.processImage(image);
        console.log('✅ Image processed:', { imageS3Url, textLength: ocrResult.text?.length || 0 });
      }

      // Merge new data into context
      if (imageS3Url) context.imageS3Url = imageS3Url;
      if (ocrResult.text) context.imageText = ocrResult.text;
      if (ocrResult.labels) context.imageLabels = ocrResult.labels;
      if (audioS3Url) context.audioS3Url = audioS3Url;
      if (audioTranscript) context.audioTranscript = audioTranscript;
      if (text) context.rawText = text;

      // Extract features and build context
      console.log('🔍 Processing complaint text...');
      const builtContext = await inputHandler.processComplaint(context.rawText, image);
      Object.assign(context, builtContext);
      console.log('✅ Context built:', { confidence: context.confidence, type: context.complaintType });

      // Company lookup
      console.log('🏢 Identifying company...');
      const companyInfo = await entityResolver.identifyCompany(context);
      const contactDetails = await entityResolver.getContactDetails(companyInfo.name);
      context.companyInfo = companyInfo;
      context.contactDetails = contactDetails;
      console.log('✅ Company identified:', companyInfo.name);

      // Handle complaint ID
      let realComplaintId = complaintId;
      
      if (!isFollowup) {
        // For new complaints, create a new Firestore document and use its ID
        console.log('📄 Creating new complaint document...');
        const complaintRef = await db.collection('complaints').add({
          userId,
          rawText: text,
          status: 'processing',
          company: companyInfo.name,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          conversationHistory: [],
          extractedFields: {}
        });
        realComplaintId = complaintRef.id;
        console.log('✅ New complaint created with ID:', realComplaintId);
      } else {
        // For follow-ups, ensure the complaint exists
        if (!complaintId) {
          throw new Error('complaintId is required for follow-up questions');
        }
        
        // Verify the complaint document exists
        const complaintDoc = await db.collection('complaints').doc(complaintId).get();
        if (!complaintDoc.exists) {
          throw new Error(`Complaint document ${complaintId} not found`);
        }
        console.log('✅ Using existing complaint ID:', complaintId);
        // Process the answer before asking next question
        if (questionId && answer) {
          await conversationManager.processAnswer(complaintId, questionId, answer);
        }
      }

      // Follow-up questions (API MODE - NON-BLOCKING)
      console.log('💬 Processing follow-up questions (API MODE)...');
      const enhancedContext = await followupQuestionFlow.askQuestions(context, companyInfo, realComplaintId);
      console.log('✅ Follow-up processing completed');

      // Determine if we need to place a call (only when all questions are done)
      let callResult: CallResult = {
        status: 'pending',
        resolution: 'Processing complaint...',
        nextSteps: ['Gathering information']
      };

      // Check if we have pending questions
      const pendingQuestions = enhancedContext.conversationHistory.filter(turn => !turn.answer || turn.answer === '');
      const hasMoreQuestions = pendingQuestions.length > 0;

      console.log(`❓ Pending questions: ${pendingQuestions.length}`);

      if (!hasMoreQuestions) {
        // All questions answered, place the call
        console.log('📞 All questions answered, placing call...');
        try {
          callResult = await callOrchestrator.placeComplaintCall(enhancedContext, contactDetails, realComplaintId);
          console.log('✅ Call placed successfully');
        } catch (callError) {
          console.error('❌ Call failed:', callError);
          // Continue even if call fails
          callResult = {
            status: 'call_failed',
            resolution: 'Call placement failed, will retry later',
            nextSteps: ['Manual follow-up required']
          };
        }
      } else {
        console.log('⏸️ Still have questions pending, skipping call for now');
      }

      // Prepare the response
      const nextQuestion = hasMoreQuestions ? {
        id: pendingQuestions[0].id,
        question: pendingQuestions[0].question,
        type: 'text' as const
      } : null;

      const response = {
        success: true,
        complaintId: realComplaintId,
        status: callResult.status,
        resolution: callResult.resolution,
        nextSteps: callResult.nextSteps,
        company: companyInfo.name,
        audioS3Url,
        audioTranscript,
        imageS3Url,
        imageText: ocrResult.text,
        imageLabels: ocrResult.labels,
        followUpQuestions: pendingQuestions.map((turn) => ({
          id: turn.id,
          question: turn.question,
          type: 'text' as const,
          answer: turn.answer
        })),
        nextQuestion,
        conversationComplete: !hasMoreQuestions,
        totalQuestions: enhancedContext.conversationHistory.length,
        answeredQuestions: enhancedContext.conversationHistory.filter(turn => !!turn.answer && turn.answer !== '').length
      };

      console.log('✅ API MODE: Processing completed successfully');
      console.log(`📋 Response summary: ${hasMoreQuestions ? 'Has next question' : 'Conversation complete'}`);
      
      return response;

    } catch (error) {
      console.error('❌ Error in unified complaint processing:', error);
      throw error;
    }
  }
}

// Export singleton instance for easy import
export const complaintResolutionSystem = new ComplaintResolutionSystem();