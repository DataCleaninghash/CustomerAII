import { OpenAIClient } from '../llm/openAIClient';
import { EnhancedComplaintContext, ConversationTurn, COMPLAINT_TYPES } from '../../types/followupQuestions';
import { db } from '../../config/firebase';
import * as admin from 'firebase-admin';
import followupQuestionsConfig from '../../config/followupQuestions.config';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';

export class FollowupHandler {
  private openAIClient: OpenAIClient;

  constructor() {
    this.openAIClient = new OpenAIClient();
  }

  /**
   * Pre-analyze the complaint to extract obvious information
   */
  async preAnalyzeComplaint(context: EnhancedComplaintContext): Promise<EnhancedComplaintContext> {
    try {
      const extractedInfo = await this.extractInformationFromText(context.originalComplaint);
      
      return {
        ...context,
        extractedFields: {
          ...context.extractedFields,
          ...extractedInfo
        }
      };
    } catch (error) {
      console.error('Error in pre-analysis:', error);
      return context;
    }
  }

  /**
   * Extract information from text using AI
   */
  private async extractInformationFromText(text: string): Promise<Record<string, any>> {
    const prompt = `
      Extract key information from this complaint text:
      "${text}"

      Look for and extract:
      - Company name (bank, service provider, etc.)
      - Issue type (account problem, billing, service issue, etc.)  
      - Product/service mentioned (debit card, account, loan, etc.)
      - Any amounts or monetary values
      - When the issue occurred
      - What the customer wants (resolution, refund, fix, etc.)
      - Account type (zero balance, savings, current, etc.)
      - Any reference numbers
      
      Return ONLY a JSON object with the extracted fields. Use simple field names.
      Example: {"company": "HDFC", "issue": "account balance problem", "product": "debit card", "resolution": "want it fixed"}
      
      If nothing is found for a field, don't include it.
    `;

    try {
      const response = await this.openAIClient.extractInformation(prompt);
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      
      try {
        const parsed = JSON.parse(jsonStr);
        return typeof parsed === 'object' ? parsed : {};
      } catch (parseError) {
        console.warn('Failed to parse pre-analysis response');
        return {};
      }
    } catch (error) {
      console.error('Error in text extraction:', error);
      return {};
    }
  }

  async shouldAskMoreQuestions(context: EnhancedComplaintContext): Promise<boolean> {
    // ABSOLUTE HARD LIMIT CHECK - No exceptions
    if (context.conversationHistory.length >= followupQuestionsConfig.maxQuestions) {
      console.log(chalk.red(`🛑 HARD LIMIT: Reached maximum questions limit: ${followupQuestionsConfig.maxQuestions}`));
      return false;
    }

    // Use LLM to intelligently determine if more questions are needed
    try {
      const shouldContinue = await this.llmShouldContinueAsking(context);
      console.log(chalk.yellow(`🤖 LLM decision: ${shouldContinue ? 'Continue asking' : 'Stop asking'}`));
      return shouldContinue;
    } catch (error) {
      console.error('Error in LLM decision making:', error);
      
      // Fallback logic
      const answeredQuestions = context.conversationHistory.filter(turn => turn.answer && turn.answer.trim() !== '').length;
      return answeredQuestions < 2; // Max 2 questions as fallback
    }
  }

  /**
   * Use LLM to determine if more questions should be asked
   */
  private async llmShouldContinueAsking(context: EnhancedComplaintContext): Promise<boolean> {
    const conversationSummary = this.buildConversationSummary(context);
    
    const prompt = `
      You are an expert customer service analyst. Determine if you have enough information to help resolve this customer's complaint, or if you need to ask more questions.

      ORIGINAL COMPLAINT: "${context.originalComplaint}"

      CONVERSATION SO FAR:
      ${conversationSummary}

      EXTRACTED INFORMATION:
      ${JSON.stringify(context.extractedFields, null, 2)}

      Do you have enough information to:
      1. Understand the exact problem
      2. Know what the customer wants as a resolution
      3. Have key details needed to help them (account info, dates, amounts, etc.)

      RULES:
      - If the original complaint is detailed and clear, you probably don't need many questions
      - If key information is missing (what exactly happened, when, what they want), ask more
      - Don't ask more than 3 questions total unless absolutely necessary
      - Quality over quantity - one good question is better than multiple vague ones

      Respond with ONLY: "CONTINUE" or "STOP"
    `;

    try {
      const response = await this.openAIClient.generateFollowupQuestions(prompt);
      const decision = response.trim().toUpperCase();
      return decision === 'CONTINUE';
    } catch (error) {
      console.error('Error in LLM decision:', error);
      return false; // Default to stop asking
    }
  }

  async generateFollowupQuestion(context: EnhancedComplaintContext): Promise<string> {
    const questionsRemaining = followupQuestionsConfig.maxQuestions - context.conversationHistory.length;
    const isLastQuestion = questionsRemaining === 1;
    
    // STRICT CHECK: Don't generate if at limit
    if (questionsRemaining <= 0) {
      console.log(chalk.red('🛑 Cannot generate question: At maximum limit'));
      return '';
    }
    
    try {
      const question = await this.llmGenerateIntelligentQuestion(context, isLastQuestion);
      console.log(chalk.green(`✅ Generated intelligent question: ${question}`));
      return question;
    } catch (error) {
      console.error('Error generating followup question:', error);
      return this.getFallbackQuestion(context, isLastQuestion);
    }
  }

  /**
   * Use LLM to generate contextually aware questions
   */
  private async llmGenerateIntelligentQuestion(context: EnhancedComplaintContext, isLastQuestion: boolean): Promise<string> {
    const conversationSummary = this.buildConversationSummary(context);
    // Debug log: Print the conversation summary sent to the LLM
    console.log(chalk.cyanBright('🧾 Conversation summary sent to LLM:'));
    console.log(conversationSummary);
    // Log the full prompt for debugging
    const prompt = `
      You are an expert customer service representative helping a customer with their complaint. Your job is to ask ONE specific, helpful question to gather missing information needed to resolve their issue.

      ORIGINAL COMPLAINT:
      "${context.originalComplaint}"

      CONVERSATION HISTORY:
      ${conversationSummary}

      INFORMATION GATHERED SO FAR:
      ${JSON.stringify(context.extractedFields, null, 2)}

      INSTRUCTIONS:
      - Look at what information is still missing to help resolve this complaint
      - Ask ONE specific, direct question that will get useful information
      - Don't repeat questions that have already been asked
      - Don't ask for information already provided in the complaint or previous answers
      - Make the question conversational and empathetic
      - Focus on actionable details (dates, amounts, account numbers, what exactly happened, what they want)
      
      ${isLastQuestion ? 'THIS IS YOUR LAST CHANCE TO GET IMPORTANT INFORMATION. Make it count.' : ''}

      Examples of GOOD questions:
      - "When exactly did this transaction occur? Please provide the date and approximate time."
      - "What specific outcome are you looking for? A refund, account correction, or something else?"
      - "Can you provide your account number or any reference number related to this issue?"
      - "How much money is involved in this problem?"

      Examples of BAD questions:
      - "Can you provide more details?" (too vague)
      - "What is your issue?" (already know from complaint)
      - "Can you clarify?" (not specific enough)

      Generate ONE specific question:
    `;
    console.log(chalk.yellow('Prompt sent to LLM for follow-up question generation:'));
    console.log(prompt);
    const response = await this.openAIClient.generateFollowupQuestions(prompt);
    
    // Clean up the response to extract just the question
    const lines = response.split('\n').filter(line => line.trim());
    let question = lines.find(line => line.includes('?')) || lines[0] || response;
    
    // Remove any prefixes or formatting
    question = question.replace(/^(Question:|Q:|Answer:|\d+\.|\-|\*)\s*/i, '').trim();
    
    // Validate question quality
    if (question.length < 10 || question.length > 150) {
      throw new Error('Generated question is too short or too long');
    }
    
    // Check for vague questions
    const vaguePhrases = ['more details', 'clarify', 'can you tell me', 'additional information'];
    const isVague = vaguePhrases.some(phrase => question.toLowerCase().includes(phrase));
    
    if (isVague && !isLastQuestion) {
      throw new Error('Generated question is too vague');
    }
    
    return question;
  }

  /**
   * Build a comprehensive conversation summary including answers
   */
  private buildConversationSummary(context: EnhancedComplaintContext): string {
    if (context.conversationHistory.length === 0) {
      return "No previous questions asked.";
    }

    return context.conversationHistory.map((turn, index) => {
      const questionPart = `Q${index + 1}: ${turn.question}`;
      const answerPart = turn.answer && turn.answer.trim() 
        ? `A${index + 1}: ${turn.answer}` 
        : `A${index + 1}: [No answer yet]`;
      return `${questionPart}\n${answerPart}`;
    }).join('\n\n');
  }

  private getFallbackQuestion(context: EnhancedComplaintContext, isLastQuestion: boolean): string {
    const conversationLength = context.conversationHistory.length;
    
    // Provide better fallback questions based on context
    if (conversationLength === 0) {
      return "To help resolve your issue quickly, could you tell me when this problem first occurred?";
    } else if (conversationLength === 1) {
      return "What specific outcome or resolution are you hoping for with this issue?";
    } else if (isLastQuestion) {
      return "Is there any other important information you think would help us resolve this issue?";
    } else {
      return "Could you provide any reference numbers, account details, or other specific information related to this problem?";
    }
  }

  async processAnswer(
    context: EnhancedComplaintContext,
    question: string,
    answer: string,
    complaintId?: string
  ): Promise<EnhancedComplaintContext> {
    // Extract meaningful information from the answer
    const extractedInfo = await this.extractInformationFromAnswer(context, question, answer);
    
    // Add the Q&A to conversation history
    const turn: ConversationTurn = {
      id: uuidv4(),
      question,
      answer,
      timestamp: new Date(),
      extractedInfo,
      confidenceDelta: Object.keys(extractedInfo).length > 0 ? 0.2 : 0.1
    };

    // Update context with new information
    const updatedHistory = [...context.conversationHistory, turn];
    const updatedFields = {
      ...context.extractedFields,
      ...extractedInfo
    };

    const updatedContext = {
      ...context,
      conversationHistory: updatedHistory,
      extractedFields: updatedFields
    };

    // Update Firestore if complaintId is provided
    if (complaintId && typeof complaintId === 'string' && complaintId.trim() !== '') {
      try {
        await db.collection('complaints').doc(complaintId).update({
          conversationHistory: updatedHistory,
          extractedFields: updatedFields,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(chalk.green('✅ Updated conversation in Firestore'));
      } catch (error) {
        console.error('Error updating conversation history in Firebase:', error);
        throw error;
      }
    }

    return updatedContext;
  }

  /**
   * FIXED: Extract information from user's answer using LLM
   */
  async extractInformationFromAnswer(
    context: EnhancedComplaintContext,
    question: string,
    answer: string
  ): Promise<Record<string, any>> {
    try {
      const prompt = `
        Extract useful information from the user's answer to a follow-up question about their complaint.

        ORIGINAL COMPLAINT: "${context.originalComplaint}"

        QUESTION ASKED: "${question}"

        USER'S ANSWER: "${answer}"

        CURRENT INFORMATION: ${JSON.stringify(context.extractedFields, null, 2)}

        Extract any new information from the answer. Look for:
        - Dates and times
        - Amounts of money
        - Account numbers or reference numbers
        - Specific products or services
        - Desired outcomes or resolutions
        - Names of people or departments
        - Locations
        - Any other factual details

        Return ONLY a JSON object with the extracted information. Use descriptive field names.
        If no new information is found, return an empty object {}.

        Example: {"transaction_date": "2024-01-15", "amount": "250", "desired_outcome": "refund"}
      `;

      const response = await this.openAIClient.extractInformation(prompt);
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : '{}';
      
      try {
        const parsed = JSON.parse(jsonStr);
        console.log(chalk.blue('📊 Extracted from answer:'), parsed);
        return typeof parsed === 'object' ? parsed : {};
      } catch (parseError) {
        console.warn('Failed to parse answer extraction response');
        return {};
      }
    } catch (error) {
      console.error('Error extracting information from answer:', error);
      return {};
    }
  }
} 