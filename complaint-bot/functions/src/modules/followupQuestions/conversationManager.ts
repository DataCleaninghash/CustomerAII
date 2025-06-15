/**
 * ConversationManager: Manages the question-answer flow
 */
import { ComplaintContext } from '../../types/inputHandler';
import { CompanyInfo } from '../../types/entityResolver';
import { ConversationTurn, EnhancedComplaintContext } from '../../types/followupQuestions';
import { ConfidenceEvaluator } from './confidenceEvaluator';
import followupQuestionsConfig from '../../config/followupQuestions.config';
import chalk from 'chalk';
import { db } from '../../config/firebase';
import * as admin from 'firebase-admin';
import { FollowupHandler } from './followupHandler';
import { v4 as uuidv4 } from 'uuid';

export class ConversationManager {
  private confidenceEvaluator: ConfidenceEvaluator;
  private followupHandler: FollowupHandler;

  constructor() {
    this.confidenceEvaluator = new ConfidenceEvaluator();
    this.followupHandler = new FollowupHandler();
  }

  /**
   * Manage the follow-up question flow (API MODE - NO READLINE)
   * @param context Initial complaint context
   * @param companyInfo Company information
   * @param complaintId ID of the complaint
   * @returns Enhanced complaint context with conversation history
   */
  async askQuestions(
    context: ComplaintContext, 
    companyInfo: CompanyInfo,
    complaintId: string
  ): Promise<EnhancedComplaintContext> {
    console.log(chalk.blue('\n=== INTELLIGENT FOLLOW-UP SYSTEM ==='));
    console.log(chalk.gray(`Maximum questions allowed: ${followupQuestionsConfig.maxQuestions}`));
    console.log(chalk.gray(`Complaint ID: ${complaintId}`));
    console.log(chalk.gray(`Original complaint: "${context.rawText?.substring(0, 100)}..."`));
    
    // Verify complaint document exists and get existing data
    let existingData: any = {};
    try {
      const complaintDoc = await db.collection('complaints').doc(complaintId).get();
      if (!complaintDoc.exists) {
        throw new Error(`Complaint document ${complaintId} not found`);
      }
      existingData = complaintDoc.data() || {};
      console.log(chalk.green(`✅ Complaint document found with ${existingData.conversationHistory?.length || 0} existing questions`));
    } catch (error) {
      console.error('❌ Error fetching complaint document:', error);
      throw error;
    }

    // Get user details from the complaint document
    let userDetails;
    if (existingData.userId) {
      try {
        const userDoc = await db.collection('users').doc(existingData.userId).get();
        userDetails = userDoc.data();
        console.log(chalk.green(`✅ User details loaded: ${userDetails?.name || 'Unknown'}`));
      } catch (error) {
        console.error('⚠️ Error fetching user details:', error);
      }
    }

    // Initialize enhanced context with existing conversation history
    let enhancedContext: EnhancedComplaintContext = {
      originalComplaint: context.rawText,
      conversationHistory: existingData.conversationHistory || [],
      finalConfidence: context.confidence,
      complaintType: context.complaintType,
      extractedFields: {
        ...context.extractedFeatures,
        ...existingData.extractedFields,
        // Add user contact details if available
        ...(userDetails && {
          name: userDetails.name,
          email: userDetails.email,
          phone: userDetails.phone
        })
      },
      userDetails: userDetails ? {
        name: userDetails.name,
        email: userDetails.email,
        phone: userDetails.phone
      } : undefined
    };

    // Debug log: Print the full conversation history before generating the next question
    console.log(chalk.magentaBright('📝 Full conversation history before generating next question:'));
    if (enhancedContext.conversationHistory.length === 0) {
      console.warn('⚠️ Conversation history is empty! This may indicate a bug or overwrite.');
    } else {
      enhancedContext.conversationHistory.forEach((turn, idx) => {
        console.log(`Q${idx + 1}: ${turn.question}`);
        console.log(`A${idx + 1}: ${turn.answer || '[No answer yet]'}`);
      });
    }

    console.log(chalk.gray(`📊 Initial extracted fields: ${Object.keys(enhancedContext.extractedFields || {}).join(', ')}`));
    console.log(chalk.gray(`📚 Existing conversation turns: ${enhancedContext.conversationHistory.length}`));

    // Pre-analyze the complaint to extract obvious information (only if no existing history)
    if (enhancedContext.conversationHistory.length === 0) {
      console.log(chalk.blue('🔍 Pre-analyzing complaint for obvious information...'));
      enhancedContext = await this.followupHandler.preAnalyzeComplaint(enhancedContext);
      console.log(chalk.green(`✅ Pre-analyzed fields: ${Object.keys(enhancedContext.extractedFields || {}).join(', ')}`));
    }

    // Check for pending (unanswered) questions
    const pendingQuestions = enhancedContext.conversationHistory.filter(turn => !turn.answer || turn.answer.trim() === '');
    console.log(chalk.yellow(`⏳ Pending unanswered questions: ${pendingQuestions.length}`));

    // If we have a pending question, don't generate a new one
    if (pendingQuestions.length > 0) {
      console.log(chalk.blue('✅ Found pending question, returning existing context for user to answer'));
      const finalConfidence = this.confidenceEvaluator.calculateOverallConfidence(
        context.confidence,
        enhancedContext.conversationHistory
      );
      enhancedContext.finalConfidence = finalConfidence;
      return enhancedContext;
    }

    // Intelligent question generation logic
    const answeredQuestions = enhancedContext.conversationHistory.filter(turn => turn.answer && turn.answer.trim() !== '');
    const questionCount = answeredQuestions.length;
    const MAX_QUESTIONS = followupQuestionsConfig.maxQuestions;
    
    console.log(chalk.blue(`🤔 Decision time: ${questionCount} questions answered, max allowed: ${MAX_QUESTIONS}`));

    if (questionCount < MAX_QUESTIONS) {
      console.log(chalk.blue('🧠 Checking if more questions are needed...'));
      
      // Use intelligent decision making
      const shouldContinue = await this.followupHandler.shouldAskMoreQuestions(enhancedContext);
      
      if (shouldContinue) {
        console.log(chalk.green('✅ Decision: Ask another question'));
        
        const question = await this.followupHandler.generateFollowupQuestion(enhancedContext);
        
        if (question && question.trim().length > 0) {
          // Add the question as an unanswered turn with a UUID
          const newTurn: ConversationTurn = {
            id: uuidv4(),
            question,
            answer: '',
            timestamp: new Date(),
            extractedInfo: {},
            confidenceDelta: 0
          };
          
          enhancedContext.conversationHistory.push(newTurn);
          console.log(chalk.green(`✅ Generated intelligent question ${questionCount + 1}:`));
          console.log(chalk.white(`   "${question}"`));
        } else {
          console.log(chalk.yellow('⚠️ No question generated - conversation complete'));
        }
      } else {
        console.log(chalk.green('✅ Decision: No more questions needed - conversation complete'));
      }
    } else {
      console.log(chalk.red(`🛑 Maximum questions reached: ${MAX_QUESTIONS}`));
    }
    
    // Calculate final confidence
    const finalConfidence = this.confidenceEvaluator.calculateOverallConfidence(
      context.confidence,
      enhancedContext.conversationHistory.filter(turn => turn.answer && turn.answer.trim() !== '')
    );
    enhancedContext.finalConfidence = finalConfidence;

    // Determine if question flow is completed
    const hasUnansweredQuestions = enhancedContext.conversationHistory.some(turn => !turn.answer || turn.answer.trim() === '');
    const questionFlowCompleted = !hasUnansweredQuestions;

    // Update Firebase with the current state
    try {
      await db.collection('complaints').doc(complaintId).update({
        conversationHistory: enhancedContext.conversationHistory,
        extractedFields: enhancedContext.extractedFields,
        finalConfidence,
        questionFlowCompleted,
        questionsAsked: enhancedContext.conversationHistory.length,
        questionsAnswered: answeredQuestions.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(chalk.green('✅ Successfully updated Firebase with intelligent conversation state'));
    } catch (error) {
      console.error('❌ Error saving state to Firebase:', error);
      throw error;
    }

    console.log(chalk.blue(`✅ Returning enhanced context: ${questionFlowCompleted ? 'COMPLETE' : 'PENDING ANSWER'}`));
    return enhancedContext;
  }

  /**
   * Process a user's answer to a follow-up question (ENHANCED)
   */
  async processAnswer(
    complaintId: string,
    questionId: string,
    answer: string
  ): Promise<EnhancedComplaintContext> {
    console.log(chalk.blue(`\n=== PROCESSING INTELLIGENT ANSWER ===`));
    console.log(chalk.gray(`Complaint ID: ${complaintId}`));
    console.log(chalk.gray(`Answer: "${answer?.substring(0, 100)}..."`));
    try {
      // Get current state from Firebase
      const complaintDoc = await db.collection('complaints').doc(complaintId).get();
      if (!complaintDoc.exists) {
        throw new Error(`Complaint document ${complaintId} not found`);
      }
      const complaintData = complaintDoc.data()!;
      let conversationHistory: ConversationTurn[] = complaintData.conversationHistory || [];
      console.log(chalk.gray(`[Before] Full conversationHistory:`), JSON.stringify(conversationHistory, null, 2));
      // Use questionId to find the correct question by UUID
      const questionIndex = conversationHistory.findIndex(turn => turn.id === questionId);
      console.log(chalk.gray(`Looking for questionId: ${questionId}, found at index: ${questionIndex}`));
      if (questionIndex === -1) {
        console.log(chalk.red(`❌ No question found matching questionId: ${questionId}`));
        console.log(chalk.red(`❌ Current conversationHistory:`), JSON.stringify(conversationHistory, null, 2));
        throw new Error(`No question found matching questionId: ${questionId}`);
      }
      const questionToAnswer = conversationHistory[questionIndex].question;
      console.log(chalk.green(`✅ Found question to answer: "${questionToAnswer}" (questionId: ${questionId})`));
      // Create enhanced context for information extraction
      const tempContext: EnhancedComplaintContext = {
        originalComplaint: complaintData.rawText || '',
        conversationHistory: conversationHistory.slice(0, questionIndex), // Previous turns only
        finalConfidence: complaintData.finalConfidence || 0.5,
        complaintType: complaintData.complaintType || 'GENERAL',
        extractedFields: complaintData.extractedFields || {},
        userDetails: complaintData.userDetails
      };
      // Extract information from the answer using the enhanced method
      console.log(chalk.blue('🧠 Extracting information from answer...'));
      const extractedInfo = await this.followupHandler.extractInformationFromAnswer(
        tempContext,
        questionToAnswer,
        answer
      );
      // Update the conversation turn with the answer and extracted info
      conversationHistory[questionIndex].answer = answer;
      conversationHistory[questionIndex].timestamp = new Date();
      conversationHistory[questionIndex].extractedInfo = extractedInfo;
      conversationHistory[questionIndex].confidenceDelta = Object.keys(extractedInfo).length > 0 ? 0.2 : 0.1;
      // Update extracted fields with new information
      const updatedFields = {
        ...complaintData.extractedFields,
        ...extractedInfo
      };
      console.log(chalk.green(`✅ Extracted info from answer:`), extractedInfo);
      console.log(chalk.gray(`[After] Full conversationHistory:`), JSON.stringify(conversationHistory, null, 2));
      // Create final enhanced context
      const enhancedContext: EnhancedComplaintContext = {
        originalComplaint: complaintData.rawText || '',
        conversationHistory,
        finalConfidence: complaintData.finalConfidence || 0.5,
        complaintType: complaintData.complaintType || 'GENERAL',
        extractedFields: updatedFields,
        userDetails: complaintData.userDetails
      };
      // Calculate updated confidence
      const finalConfidence = this.confidenceEvaluator.calculateOverallConfidence(
        complaintData.finalConfidence || 0.5,
        conversationHistory.filter(turn => turn.answer && turn.answer.trim() !== '')
      );
      enhancedContext.finalConfidence = finalConfidence;
      // Update Firebase with the processed answer
      const hasUnansweredQuestions = conversationHistory.some(turn => !turn.answer || turn.answer.trim() === '');
      try {
        await db.collection('complaints').doc(complaintId).update({
          conversationHistory,
          extractedFields: updatedFields,
          finalConfidence,
          questionFlowCompleted: !hasUnansweredQuestions,
          questionsAnswered: conversationHistory.filter(turn => turn.answer && turn.answer.trim() !== '').length,
          lastAnswerProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Firestore update succeeded');
      } catch (error) {
        console.error('❌ Error saving state to Firebase:', error);
        throw error;
      }
      // Add a delay to help with Firestore consistency
      await new Promise(res => setTimeout(res, 200));
      console.log(chalk.green('✅ Answer processed and saved to Firebase with enhanced information'));
      console.log(chalk.blue(`✅ Flow status: ${hasUnansweredQuestions ? 'PENDING MORE ANSWERS' : 'CONVERSATION COMPLETE'}`));
      console.log('Received questionId from frontend:', questionId);
      console.log('ConversationHistory IDs:', conversationHistory.map(q => q.id));
      console.log('Found at index:', questionIndex);
      console.log('Answer being set:', answer);
      console.log('Updated conversationHistory:', JSON.stringify(conversationHistory, null, 2));
      return enhancedContext;
    } catch (error) {
      console.error('❌ Error processing answer:', error);
      throw error;
    }
  }

  /**
   * Close method - no-op in API mode (no readline interface)
   */
  close(): void {
    console.log(chalk.blue('✅ ConversationManager: No cleanup needed in API mode'));
  }
}