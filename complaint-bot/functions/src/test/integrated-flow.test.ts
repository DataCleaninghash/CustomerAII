import { ComplaintProcessor } from '../modules/complaintProcessing/complaintProcessor';
import { ConversationManager } from '../modules/followupQuestions/conversationManager';
import { EntityRecognizer } from '../modules/entityResolver/entityRecognizer';
import * as readline from 'readline';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { ContactScraper } from '../modules/entityResolver/contactScraper';
import { CallManager } from '../modules/callOrchestration/callManager';
import { EmailManager, EmailResult, ComplaintEmailData } from '../modules/notifications/emailManager';
import { EnhancedComplaintContext } from '../types/followupQuestions';
import { ContactDetails, CompanyInfo } from '../types/entityResolver';
import { ComplaintContext } from '../types/inputHandler';
import { WebSocketServer, WebSocket } from 'ws';
import axios from 'axios';
import { setupBlandAIWebSocketServer, processAudioWithBlandAI } from '../modules/callOrchestration/blandAIWebSocketServer';
import { Server } from 'http';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { CallStatus, BlandAIResponse } from '../types';
import { db } from '../config/firebase';
import * as admin from 'firebase-admin';
import winston from 'winston';

// Load environment variables
dotenv.config();

// Initialize logger for call operations
const callLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'call-operations.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function for prompts
const prompt = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
};

// Add type definition for call result
interface CallResult {
  status: string;
  callId: string | null;
  resolution: string;
  nextSteps: string;
  transcript?: any[];
  referenceNumber?: string | null;
  duration?: number;
  cost?: number;
  error?: string;
  ivrInteractions?: any[];
}

// Real Call Implementation Class
class BlandAICallManager {
  private apiKey: string;
  private webhookUrl: string;

  constructor() {
    this.apiKey = process.env.BLAND_AI_API_KEY || '';
    this.webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000';
  }

  async initiateCall(
    phoneNumber: string, 
    complaintContext: string, 
    extractedInfo: any, 
    companyInfo: CompanyInfo
  ): Promise<CallResult> {
    try {
      printCallProgress('🚀 Real Call Initiation', `Initiating call to ${phoneNumber} for ${companyInfo.name} customer service...`);

      const callTask = this.generateCallTask(complaintContext, extractedInfo, companyInfo);
      
      const callResponse = await axios.post('https://api.bland.ai/v1/calls', {
        phone_number: phoneNumber,
        task: callTask,
        voice: 'nat',
        reduce_latency: true,
        webhook: `${this.webhookUrl}/call-webhook`,
        max_duration: 15, // 15 minutes max
        answered_by_enabled: true,
        wait_for_greeting: true,
        record: true,
        language: 'en',
        interruption_threshold: 100,
        voicemail_message: `Hi, this is an automated call regarding a customer service issue for ${extractedInfo.name || 'a customer'}. Please call back when convenient.`,
        temperature: 0.7,
        keywords: ['customer service', 'technical support', 'billing', 'returns', 'complaints']
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const callId = callResponse.data.call_id;
      callLogger.info('Call initiated successfully', { callId, phoneNumber, company: companyInfo.name });
      
      printCallProgress('✅ Call ID Generated', `Call initiated with ID: ${callId}`);

      // Monitor the call in real-time
      const callResult = await this.monitorCallProgress(callId, companyInfo.name);
      
      return {
        status: 'completed',
        callId: callId,
        resolution: callResult.resolution,
        nextSteps: callResult.nextSteps,
        transcript: callResult.transcript,
        referenceNumber: callResult.referenceNumber,
        duration: callResult.duration,
        cost: callResult.cost,
        ivrInteractions: callResult.ivrInteractions
      };

    } catch (error: any) {
      callLogger.error('Call initiation failed', { 
        error: error.message, 
        phoneNumber, 
        company: companyInfo.name 
      });
      
      printCallProgress('❌ Call Failed', `Error: ${error.message}`);
      
      return {
        status: 'failed',
        callId: null,
        resolution: 'Call could not be completed due to technical issues',
        nextSteps: 'Please try calling the customer service number manually',
        error: error.message
      };
    }
  }

  private generateCallTask(complaintContext: string, extractedInfo: any, companyInfo: CompanyInfo): string {
    return `
You are an AI assistant calling ${companyInfo.name} customer service on behalf of ${extractedInfo.name || 'a customer'}.

CUSTOMER DETAILS:
- Name: ${extractedInfo.name || 'Customer preferred not to share'}
- Email: ${extractedInfo.email || 'Not provided'}
- Phone: ${extractedInfo.phone || 'Not provided'}

COMPLAINT DETAILS:
- Company: ${companyInfo.name}
- Issue: ${extractedInfo.issue || 'General complaint'}
- Product/Service: ${extractedInfo.product || 'Not specified'}
- Date of Issue: ${extractedInfo.date || 'Recently'}
- Desired Resolution: ${extractedInfo.resolution || 'Fair resolution of the issue'}

FULL COMPLAINT CONTEXT: ${complaintContext}

YOUR CAPABILITIES AND TASKS:

1. IVR NAVIGATION:
   - When you detect an IVR system, listen carefully to ALL menu options
   - Look for keywords like: "customer service", "technical support", "complaints", "billing", "returns"
   - Press the appropriate DTMF key (usually 0 for operator, or specific numbers for departments)
   - If unsure, press 0 to reach a human operator
   - Be patient and wait for prompts to complete before pressing keys
   - Log each IVR interaction for tracking

2. HUMAN INTERACTION:
   - Introduce yourself professionally: "Hello, I'm calling on behalf of ${extractedInfo.name || 'a customer'} regarding an issue with their ${extractedInfo.product || 'recent order/service'}"
   - Clearly explain the situation: "${extractedInfo.issue || 'The customer is experiencing an issue'}"
   - Provide customer details when requested (name, email, phone, order numbers)
   - Work toward resolution: "${extractedInfo.resolution || 'We would like to resolve this issue fairly'}"
   - Ask for a reference/case/ticket number for future follow-up
   - Get clear next steps and timeline for resolution
   - Thank the agent and confirm all details before ending

3. IMPORTANT GUIDELINES:
   - Be polite, patient, and professional at all times
   - If placed on hold, wait patiently and inform when you're back
   - If transferred, accept the transfer and re-explain the situation
   - If they need information you don't have, explain you're calling on behalf of the customer
   - If they require the customer to call directly, ask what reference number or information the customer should use
   - Take detailed notes of agent names, reference numbers, and promised actions
   - If the issue cannot be resolved immediately, get a clear timeline and follow-up process

4. SPECIFIC ACTIONS TO TAKE:
   - Get the agent's name and/or employee ID
   - Obtain a case/reference/ticket number
   - Confirm the resolution steps in writing (email confirmation if possible)
   - Ask about escalation procedures if the initial agent cannot help
   - Request supervisor if needed for complex issues

GOAL: Achieve a satisfactory resolution for the customer's ${extractedInfo.issue || 'complaint'} regarding their ${extractedInfo.product || 'experience'} with ${companyInfo.name}, or get clear next steps with a reference number for follow-up.

Remember: You represent the customer's interests. Be persistent but respectful in seeking a fair resolution.
    `.trim();
  }

  private async monitorCallProgress(callId: string, companyName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let checkCount = 0;
      const maxChecks = 400; // 20 minutes max (400 * 3 seconds)
      
      printCallProgress('📞 Call Monitoring Started', `Monitoring call progress for Call ID: ${callId}`);
      
      const checkInterval = setInterval(async () => {
        try {
          checkCount++;
          
          const response = await axios.get(`https://api.bland.ai/v1/calls/${callId}`, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`
            }
          });

          const call = response.data;
          
          // Log call status updates (only when status changes)
          if (call.status && call.status !== 'in-progress') {
            printCallProgress(`📞 Call Status Update`, `Status: ${call.status} | Duration: ${call.call_length || 0}s`);
          }

          // Log IVR interactions as they happen
          if (call.ivr_interactions && call.ivr_interactions.length > 0) {
            const lastIvr = call.ivr_interactions[call.ivr_interactions.length - 1];
            printCallProgress('🔢 IVR Navigation', `Prompt: "${lastIvr.prompt}" | Selected: ${lastIvr.selected_option || 'N/A'}`);
          }

          // Log transcript updates (new entries only)
          if (call.transcript && call.transcript.length > 0) {
            const lastEntry = call.transcript[call.transcript.length - 1];
            if (lastEntry.user === 'assistant') {
              printCallProgress('🤖 AI Agent Says', lastEntry.text);
            } else {
              printCallProgress('👤 Human Agent Says', lastEntry.text);
            }
          }

          // Check if call is complete
          if (call.status === 'completed') {
            clearInterval(checkInterval);
            
            callLogger.info('Call completed successfully', {
              callId,
              duration: call.call_length,
              cost: call.cost
            });
            
            // Extract key information from the call
            const resolution = this.extractResolutionFromTranscript(call.transcript);
            const referenceNumber = this.extractReferenceNumber(call.transcript);
            const nextSteps = this.extractNextSteps(call.transcript);
            
            printCallProgress('✅ Call Completed Successfully', `
Duration: ${call.call_length || 0} seconds
Cost: $${call.cost || '0.00'}
Resolution: ${resolution || 'Call completed successfully'}
Reference Number: ${referenceNumber || 'None provided'}
Next Steps: ${nextSteps}
            `);
            
            resolve({
              resolution: resolution || `Call completed successfully with ${companyName} customer service`,
              nextSteps: nextSteps || 'Follow up as needed based on agent instructions',
              transcript: call.transcript || [],
              referenceNumber: referenceNumber,
              duration: call.call_length || 0,
              cost: call.cost || 0,
              ivrInteractions: call.ivr_interactions || []
            });
            
          } else if (call.status === 'failed' || call.status === 'cancelled' || call.status === 'no-answer') {
            clearInterval(checkInterval);
            
            const errorMessage = call.error_message || `Call ${call.status}`;
            callLogger.error('Call failed', { callId, status: call.status, error: errorMessage });
            
            printCallProgress('❌ Call Failed', `Status: ${call.status} | Error: ${errorMessage}`);
            
            reject(new Error(`Call ${call.status}: ${errorMessage}`));
            
          } else if (checkCount >= maxChecks) {
            clearInterval(checkInterval);
            callLogger.error('Call monitoring timeout', { callId, checkCount });
            reject(new Error('Call monitoring timeout - call may still be in progress'));
          }

          // Show progress every 30 seconds while in progress
          if (checkCount % 10 === 0 && call.status === 'in-progress') {
            printCallProgress('⏱️ Call In Progress', `Duration: ${call.call_length || 0}s | Status: ${call.status}`);
          }

        } catch (error: any) {
          clearInterval(checkInterval);
          callLogger.error('Error monitoring call', { callId, error: error.message });
          reject(error);
        }
      }, 3000); // Check every 3 seconds
    });
  }

  private extractResolutionFromTranscript(transcript: any[]): string | null {
    if (!transcript || transcript.length === 0) return null;
    
    const resolutionKeywords = [
      'reference number', 'confirmation number', 'case number', 'ticket number',
      'refund processed', 'replacement shipped', 'issue resolved', 'problem solved',
      'ticket created', 'escalated to', 'will be resolved', 'resolution',
      'we will', 'i will', 'expect', 'within', 'timeline', 'follow up'
    ];
    
    // Look through transcript in reverse order for recent resolutions
    for (const entry of transcript.slice().reverse()) {
      if (entry.user === 'assistant') continue; // Skip AI responses
      
      const text = entry.text.toLowerCase();
      if (resolutionKeywords.some(keyword => text.includes(keyword))) {
        return entry.text;
      }
    }
    
    // If no specific resolution found, return the last substantial human agent response
    for (const entry of transcript.slice().reverse()) {
      if (entry.user !== 'assistant' && entry.text.length > 20) {
        return entry.text;
      }
    }
    
    return null;
  }

  private extractReferenceNumber(transcript: any[]): string | null {
    if (!transcript || transcript.length === 0) return null;
    
    const referencePatterns = [
      /(?:reference|confirmation|case|ticket|order|claim)\s*(?:number|#|id)?\s*:?\s*([A-Z0-9]{4,})/i,
      /([A-Z]{2,}\d{4,}|\d{6,}[A-Z]{2,})/g,
      /([A-Z0-9]{8,})/g
    ];
    
    for (const entry of transcript.slice().reverse()) {
      if (entry.user === 'assistant') continue; // Skip AI responses
      
      for (const pattern of referencePatterns) {
        const matches = entry.text.match(pattern);
        if (matches) {
          return matches[1] || matches[0];
        }
      }
    }
    
    return null;
  }

  private extractNextSteps(transcript: any[]): string {
    if (!transcript || transcript.length === 0) return 'No specific next steps provided';
    
    const stepKeywords = [
      'next steps', 'what happens next', 'follow up', 'within',
      'will contact you', 'expect', 'timeline', 'will receive',
      'please', 'you should', 'make sure to', 'need to'
    ];
    
    for (const entry of transcript.slice().reverse()) {
      if (entry.user === 'assistant') continue; // Skip AI responses
      
      const text = entry.text.toLowerCase();
      if (stepKeywords.some(keyword => text.includes(keyword)) && entry.text.length > 30) {
        return entry.text;
      }
    }
    
    return 'Please follow up if you don\'t hear back within 24-48 hours';
  }

  // Method to simulate call for testing (fallback)
  async simulateCall(phoneNumber: string, complaintContext: string, extractedInfo: any, companyInfo: CompanyInfo): Promise<CallResult> {
    printCallProgress('🎭 Call Simulation Mode', `Simulating call to ${phoneNumber} for ${companyInfo.name}...`);
    
    // Simulate call duration
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return {
      status: 'simulated',
      callId: 'sim_' + Date.now(),
      resolution: `Call simulation completed - would initiate real call to ${companyInfo.name} customer service`,
      nextSteps: `In production, this would connect to ${companyInfo.name} customer service`,
      transcript: [
        { user: 'assistant', text: `Calling ${companyInfo.name} customer service...` },
        { user: 'human', text: `Thank you for calling ${companyInfo.name}. How can I help you today?` },
        { user: 'assistant', text: `Hi, I'm calling on behalf of ${extractedInfo.name} regarding ${extractedInfo.issue}...` }
      ],
      duration: 180,
      cost: 0.00,
      referenceNumber: 'SIM' + Math.random().toString(36).substr(2, 9).toUpperCase()
    };
  }
}

// Firebase database operations
class FirebaseDatabase {
  async createUser(userData: any): Promise<string> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new Error('Invalid email format');
    }

    // Validate phone format (basic international format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(userData.phone)) {
      throw new Error('Invalid phone format. Must be in international format (e.g., +1234567890)');
    }

    // Check if email already exists
    const emailQuery = await db.collection('users').where('email', '==', userData.email).get();
    if (!emailQuery.empty) {
      throw new Error('Email is already registered');
    }

    // Check if phone already exists
    const phoneQuery = await db.collection('users').where('phone', '==', userData.phone).get();
    if (!phoneQuery.empty) {
      throw new Error('Phone number is already registered');
    }

    const userRef = await db.collection('users').add({
      ...userData, 
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return userRef.id;
  }

  async findUserByEmail(email: string): Promise<any> {
    const query = await db.collection('users').where('email', '==', email).get();
    return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
  }

  async findUserByPhone(phone: string): Promise<any> {
    const query = await db.collection('users').where('phone', '==', phone).get();
    return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
  }

  async displayAllUsers() {
    console.log('\nAll registered users:');
    const snapshot = await db.collection('users').get();
    snapshot.forEach(doc => {
      const user = doc.data();
      console.log(`
User ID: ${doc.id}
Name: ${user.name}
Email: ${user.email}
Phone: ${user.phone}
Created At: ${user.createdAt?.toDate()}
-------------------`);
    });
  }

  async createComplaint(complaintData: any): Promise<string> {
    const complaintRef = await db.collection('complaints').add({
      ...complaintData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return complaintRef.id;
  }

  async updateComplaint(complaintId: string, data: any): Promise<void> {
    // Deep clean function to remove undefined values recursively
    const deepClean = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return null;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(deepClean).filter(item => item !== null && item !== undefined);
      }
      
      if (typeof obj === 'object') {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const cleanedValue = deepClean(value);
          if (cleanedValue !== null && cleanedValue !== undefined) {
            cleaned[key] = cleanedValue;
          }
        }
        return cleaned;
      }
      
      return obj;
    };
    
    // Clean the data to remove undefined values deeply
    const cleanData = deepClean(data);
    
    await db.collection('complaints').doc(complaintId).update({
      ...cleanData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  async createCall(callData: any): Promise<string> {
    const callRef = await db.collection('calls').add({
      ...callData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return callRef.id;
  }

  async getCachedContact(companyName: string): Promise<any> {
    const query = await db.collection('contactCache').where('companyName', '==', companyName.toLowerCase()).get();
    return query.empty ? null : query.docs[0].data();
  }

  async cacheContact(companyName: string, contactData: any): Promise<void> {
    await db.collection('contactCache').doc(companyName.toLowerCase()).set({
      ...contactData,
      companyName: companyName.toLowerCase(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

// Print section headers with ASCII box
function printSection(title: string, content: string) {
  const width = Math.max(title.length + 4, 60);
  const top = '┌' + '─'.repeat(width - 2) + '┐';
  const bottom = '└' + '─'.repeat(width - 2) + '┘';
  const titleLine = '│ ' + chalk.bold(title) + ' '.repeat(width - title.length - 3) + '│';
  
  console.log('\n' + chalk.blue(top));
  console.log(chalk.blue(titleLine));
  console.log(chalk.blue('├' + '─'.repeat(width - 2) + '┤'));
  console.log(content);
  console.log(chalk.blue(bottom));
}

// Validate environment variables
function validateEnvironment() {
  const requiredVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'BLAND_AI_API_KEY',
    'SERP_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_VISION_API_KEY'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error(chalk.red('Missing required environment variables:'));
    missing.forEach(varName => console.error(chalk.yellow(`- ${varName}`)));
    process.exit(1);
  }
}

// Add call progress logging function
function printCallProgress(step: string, details: string) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(chalk.blue(`\n[${timestamp}] ${step}`));
  console.log(chalk.gray('─'.repeat(80)));
  console.log(details);
  console.log(chalk.gray('─'.repeat(80)));
}

// Add email progress logging function
function printEmailProgress(step: string, details: string) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(chalk.green(`\n[${timestamp}] ${step}`));
  console.log(chalk.gray('─'.repeat(80)));
  console.log(details);
  console.log(chalk.gray('─'.repeat(80)));
}

async function runIntegratedTest() {
  // Initialize components
  const database = new FirebaseDatabase();
  const conversationManager = new ConversationManager();
  const entityRecognizer = new EntityRecognizer();
  const contactScraper = new ContactScraper();
  const blandAICallManager = new BlandAICallManager();
  const emailManager = new EmailManager(); // Initialize EmailManager
  
  try {
    console.log(chalk.magenta('🚀 Starting Integrated Complaint Resolution Pipeline'));
    console.log(chalk.gray('═'.repeat(80)));

    // 1. Authentication Flow
    printSection('Authentication', 'Welcome to the Complaint Resolution System');
    
    const authChoice = await prompt(chalk.cyan('Do you want to (1) Sign Up, (2) Sign In, or (3) View All Users? '));
    let userId: string | undefined;
    let userEmail: string | undefined;
    
    if (authChoice === '1') {
      // Sign Up
      printSection('Sign Up', 'Please provide your details:');
      
      let name, email, phone, password;
      let isValid = false;
      
      while (!isValid) {
        try {
          name = await prompt(chalk.cyan('Name: '));
          email = await prompt(chalk.cyan('Email: '));
          phone = await prompt(chalk.cyan('Phone (with country code, e.g., +1234567890): '));
          password = await prompt(chalk.cyan('Password: '));
          
          // Clean and format the input
          name = name.trim();
          email = email.trim().toLowerCase();
          phone = phone.trim().replace(/\s+/g, '').replace(/^\+{2,}/, '+');
          password = password.trim();

          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            throw new Error('Invalid email format. Please use a valid email address (e.g., user@example.com)');
          }

          // Validate phone format
          const phoneRegex = /^\+[1-9]\d{1,14}$/;
          if (!phoneRegex.test(phone)) {
            throw new Error('Invalid phone format. Must be in international format (e.g., +1234567890)');
          }

          // Validate password
          if (password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
          }

          // Create user with cleaned data
          const userData = {
            name,
            email,
            phone,
            password
          };

          userId = await database.createUser(userData);
          userEmail = email;
          isValid = true;
          
          printSection('Sign Up Complete', `
User ID: ${userId}
Name: ${name}
Email: ${email}
Phone: ${phone}
          `);
        } catch (error: any) {
          console.error(chalk.red('\nError during signup:'));
          console.error(chalk.yellow(error.message));
          console.log(chalk.cyan('\nPlease try again with valid information.'));
        }
      }
    } else if (authChoice === '2') {
      // Sign In
      printSection('Sign In', 'Please provide your credentials:');
      
      const loginMethod = await prompt(chalk.cyan('Login with (1) Email or (2) Phone? '));
      let user;
      let isValid = false;
      
      while (!isValid) {
        try {
          if (loginMethod === '1') {
            const email = await prompt(chalk.cyan('Email: '));
            user = await database.findUserByEmail(email);
            userEmail = email;
          } else {
            const phone = await prompt(chalk.cyan('Phone: '));
            user = await database.findUserByPhone(phone);
            userEmail = user?.email;
          }
          
          if (!user) {
            throw new Error('User not found');
          }
          
          const password = await prompt(chalk.cyan('Password: '));
          if (password !== user.password) {
            throw new Error('Invalid password');
          }
          
          userId = user.id;
          isValid = true;
          
          printSection('Sign In Complete', `Welcome back, ${user.name}!`);
        } catch (error: any) {
          console.error(chalk.red('\nError during sign in:'));
          console.error(chalk.yellow(error.message));
          console.log(chalk.cyan('\nPlease try again with valid credentials.'));
        }
      }
    } else if (authChoice === '3') {
      // View All Users
      await database.displayAllUsers();
      return; // Exit after viewing users
    } else {
      console.log(chalk.yellow('Invalid choice. Exiting...'));
      return;
    }

    if (!userId || !userEmail) {
      throw new Error('Authentication failed');
    }

    // 2. Complaint Input
    printSection('Complaint Details', 'Please describe your complaint:');
    
    console.log(chalk.yellow('You can submit your complaint in one of these formats:'));
    console.log('1. Text only');
    console.log('2. Text with image');
    console.log('3. Audio recording');
    
    const complaintType = await prompt('\nChoose complaint type (1-3): ');
    let textComplaint = '';
    let imagePath = '';
    let audioPath = '';

    switch (complaintType) {
      case '1':
        textComplaint = await prompt(chalk.cyan('\nEnter your complaint: '));
        break;
      case '2':
        textComplaint = await prompt(chalk.cyan('\nEnter your complaint: '));
        imagePath = await prompt(chalk.cyan('Enter the path to your image file: '));
        break;
      case '3':
        audioPath = await prompt(chalk.cyan('Enter the path to your audio file: '));
        break;
      default:
        console.log(chalk.yellow('Invalid choice. Using text-only complaint.'));
        textComplaint = await prompt(chalk.cyan('\nEnter your complaint: '));
    }

    // 3. Process Complaint (Basic processing without follow-up questions)
    printSection('Processing Complaint', 'Analyzing your complaint...');
    
    // Create complaint in database
    const complaintId = await database.createComplaint({
      userId,
      text: textComplaint,
      status: 'processing',
      createdAt: new Date()
    });

    console.log(chalk.green(`✓ Complaint created with ID: ${complaintId}`));

    // Get user's contact details
    const userContactDetails = await database.findUserByEmail(userEmail);
    if (!userContactDetails) {
      throw new Error('User contact details not found');
    }
    
    console.log(chalk.green('✓ Initial complaint processing completed'));

    // 4. Entity Recognition
    printSection('Entity Recognition', 'Identifying company and context...');
    
    const companyInfo = await entityRecognizer.identifyCompany({
      rawText: textComplaint,
      extractedFeatures: {},
      confidence: 0
    });
    
    printSection('Company Identified', `
Company: ${companyInfo.name}
Confidence: ${companyInfo.confidence.toFixed(2)}
Products: ${companyInfo.products?.join(', ') || 'None specified'}
    `);

    // 5. Follow-up Questions (ONLY HERE - No double questions)
    printSection('Follow-up Questions', 'Gathering additional information...');
    
    // Create initial complaint context
    const initialComplaintContext: ComplaintContext = {
      rawText: textComplaint,
      extractedFeatures: {},
      confidence: 0
    };

    // Ask questions and get enhanced context
    console.log(chalk.cyan('\nStarting follow-up questions to gather more details...'));
    
    let updatedContext: EnhancedComplaintContext;
    try {
      // Set a timeout for the conversation manager to prevent hanging
      const conversationPromise = conversationManager.askQuestions(
      initialComplaintContext,
      companyInfo,
      complaintId
    );

      // Add timeout (5 minutes max for questions)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Follow-up questions timed out')), 300000);
      });
      
      updatedContext = await Promise.race([conversationPromise, timeoutPromise]);
      
    } catch (error) {
      console.error(chalk.red('Error in follow-up questions:'), error);
      // Create fallback context if questions fail
      updatedContext = {
        originalComplaint: textComplaint,
        conversationHistory: [],
        finalConfidence: 0.7,
        extractedFields: {
          issue: 'Follow-up questions failed',
          resolution: 'Manual review needed'
        }
      };
    }

    console.log(chalk.green('✓ Follow-up questions completed'));

    // Show conversation summary
    if (updatedContext.conversationHistory.length > 0) {
      printSection('Conversation Summary', `
Questions Asked: ${updatedContext.conversationHistory.length}
Final Confidence: ${updatedContext.finalConfidence.toFixed(2)}
Extracted Fields: ${Object.keys(updatedContext.extractedFields || {}).join(', ')}

Last Q&A:
Q: ${updatedContext.conversationHistory[updatedContext.conversationHistory.length - 1]?.question}
A: ${updatedContext.conversationHistory[updatedContext.conversationHistory.length - 1]?.answer}
      `);
    } else {
      console.log(chalk.yellow('No follow-up questions were asked.'));
    }

    // 6. Contact Scraping
    printSection('Contact Scraping', 'Finding company contact information...');
    
    // Check cache first
    let contactDetails = await database.getCachedContact(companyInfo.name);
    
    if (!contactDetails) {
      console.log(chalk.yellow('Contact not in cache, scraping...'));
      try {
      contactDetails = await contactScraper.scrapeContactDetails(companyInfo.name);
      if (contactDetails) {
          await database.cacheContact(companyInfo.name, contactDetails);
          console.log(chalk.green('✓ Contact details cached'));
        }
      } catch (error) {
        console.error(chalk.red('Error scraping contact details:'), error);
        contactDetails = null;
      }
    } else {
      console.log(chalk.green('✓ Contact details found in cache'));
    }

    printSection('Contact Details', `
Phone Numbers: ${contactDetails?.phoneNumbers?.join(', ') || 'None found'}
Emails: ${contactDetails?.emails?.join(', ') || 'None found'}
Website: ${contactDetails?.website || 'None found'}
Source: ${contactDetails?.source || 'Unknown'}
    `);

    // 7. Ask user for preferences on call and email
    let phoneNumber = contactDetails?.phoneNumbers?.[0];
    if (!phoneNumber) {
      printSection('Contact Information', chalk.yellow('No phone number found. Please provide a contact number:'));
      phoneNumber = await prompt(chalk.cyan('Enter phone number (with country code, e.g., +1234567890): '));
    }

    // Ask user for call and email preferences
    const actionChoice = await prompt(chalk.cyan(`
Choose action:
1. Send email only
2. Make call only  
3. Send email AND make call (parallel)
4. Skip both

Enter choice (1-4): `));
    
    if (actionChoice === '4') {
      console.log(chalk.yellow('All actions skipped by user choice.'));
      
      // Update complaint with final results without call or email
      await database.updateComplaint(complaintId, {
        status: 'processed_no_action',
        finalContext: updatedContext
      });

      printSection('Pipeline Complete (No Action)', `
✅ Complaint Resolution Pipeline Completed

Complaint ID: ${complaintId}
User: ${userContactDetails.name}
Company: ${companyInfo.name}
Questions Asked: ${updatedContext.conversationHistory.length}
Final Confidence: ${updatedContext.finalConfidence.toFixed(2)}

Status: Processed without any outreach
The complaint has been analyzed and documented.
      `);

      console.log(chalk.green('\n🎉 Pipeline execution completed successfully!'));
      return;
    }

    // Prepare email data if email is needed
    let emailData: ComplaintEmailData | null = null;
    if (actionChoice === '1' || actionChoice === '3') {
      if (!contactDetails?.emails || contactDetails.emails.length === 0) {
        console.log(chalk.yellow('No email addresses found for this company.'));
        const emailInput = await prompt(chalk.cyan('Enter company email address (or press Enter to skip email): '));
        if (emailInput.trim()) {
          contactDetails = { ...contactDetails, emails: [emailInput.trim()] };
        } else {
          console.log(chalk.yellow('Email skipped - no email addresses available.'));
        }
      }

      if (contactDetails?.emails && contactDetails.emails.length > 0) {
        // Determine priority based on extracted fields
        let priority: 'high' | 'medium' | 'low' = 'medium';
        const urgencyKeywords = ['urgent', 'emergency', 'immediate', 'asap', 'critical'];
        const lowPriorityKeywords = ['minor', 'suggestion', 'feedback', 'improvement'];
        
        const complaintLower = textComplaint.toLowerCase();
        if (urgencyKeywords.some(keyword => complaintLower.includes(keyword))) {
          priority = 'high';
        } else if (lowPriorityKeywords.some(keyword => complaintLower.includes(keyword))) {
          priority = 'low';
        }

        emailData = {
          complaintId,
          userDetails: {
            name: userContactDetails.name,
            email: userContactDetails.email,
            phone: userContactDetails.phone
          },
          companyInfo: {
            name: companyInfo.name,
            emails: contactDetails.emails,
            industry: companyInfo.industry
          },
          complaintDetails: {
            originalComplaint: updatedContext.originalComplaint,
            extractedFields: updatedContext.extractedFields,
            conversationHistory: updatedContext.conversationHistory
          },
          priority,
          useAI: true // Enable AI email generation
        };
      }
    }

    // Prepare extracted info for the call if call is needed
    let extractedInfo: any = null;
    if (actionChoice === '2' || actionChoice === '3') {
      extractedInfo = {
        name: userContactDetails.name,
        email: userContactDetails.email,
        phone: userContactDetails.phone,
        company: companyInfo.name,
        issue: updatedContext.extractedFields?.issue || 'General complaint',
        product: updatedContext.extractedFields?.product || 'Not specified',
        date: updatedContext.extractedFields?.date || 'Recently',
        resolution: updatedContext.extractedFields?.resolution || 'Fair resolution of the issue'
      };
    }

    // For call choice, ask real vs simulation
    let useRealCall = false;
    if (actionChoice === '2' || actionChoice === '3') {
      const callTypeChoice = await prompt(chalk.cyan('Use (1) Real call or (2) Simulate call? '));
      useRealCall = callTypeChoice === '1';
    }

    let callResult: CallResult | null = null;
    let emailResult: EmailResult | null = null;
    let callRecordId: string | null = null;
    let emailRecordId: string | null = null;

    // Execute actions based on choice
    if (actionChoice === '1') {
      // Email only
      if (emailData) {
        printSection('Email Sending', 'Sending complaint email...');
        printEmailProgress('📧 Email Initiation', `Preparing to send email to ${emailData.companyInfo.emails.join(', ')}...`);
        
        try {
          emailResult = await emailManager.sendComplaintEmail(emailData);
          
          if (emailResult.success) {
            printEmailProgress('✅ Email Sent Successfully', `
Email sent to: ${emailResult.sentTo.join(', ')}
Message ID: ${emailResult.messageId || 'N/A'}
AI Generated: ${emailResult.aiGenerated ? 'Yes' : 'No'}
Tone: ${emailResult.tone || 'N/A'}
Expected Response: ${emailResult.estimatedResponseTime || 'N/A'}
            `);
          } else {
            printEmailProgress('❌ Email Failed', `Error: ${emailResult.error}`);
          }
        } catch (error) {
          console.error(chalk.red('Error sending email:'), error);
          emailResult = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            sentTo: [],
            timestamp: new Date()
          };
        }
      }

    } else if (actionChoice === '2') {
      // Call only
      printSection('Call Initiation', `Preparing to initiate call to ${phoneNumber}...`);
      
      try {
        if (useRealCall) {
          callResult = await blandAICallManager.initiateCall(
            phoneNumber,
            updatedContext.originalComplaint,
            extractedInfo,
            companyInfo
          );
        } else {
          callResult = await blandAICallManager.simulateCall(
            phoneNumber,
            updatedContext.originalComplaint,
            extractedInfo,
            companyInfo
          );
        }

        // Create call record in database
        callRecordId = await database.createCall({
          complaintId,
          userId,
          phoneNumber,
          companyName: companyInfo.name,
          callId: callResult.callId,
          status: callResult.status,
          resolution: callResult.resolution,
          nextSteps: callResult.nextSteps,
          referenceNumber: callResult.referenceNumber,
          duration: callResult.duration || 0,
          cost: callResult.cost || 0,
          transcript: callResult.transcript || [],
          ivrInteractions: callResult.ivrInteractions || [],
          error: callResult.error || null
        });

        console.log(chalk.green(`✓ Call record created with ID: ${callRecordId}`));

      } catch (error) {
        console.error(chalk.red('Error during call:'), error);
        callResult = {
          status: 'failed',
          callId: null,
          resolution: 'Call could not be completed due to technical issues',
          nextSteps: 'Please try calling the customer service number manually',
          error: error instanceof Error ? error.message : String(error)
        };
      }

    } else if (actionChoice === '3') {
      // Both email and call in parallel
      printSection('Parallel Execution', 'Sending email and making call simultaneously...');
      
      const promises: Promise<any>[] = [];
      
      // Add email promise if email data exists
      if (emailData) {
        printEmailProgress('📧 Email Initiation', `Starting email to ${emailData.companyInfo.emails.join(', ')}...`);
        
        const emailPromise = emailManager.sendComplaintEmail(emailData)
          .then(result => ({ type: 'email', result }))
          .catch(error => ({ 
            type: 'email', 
            result: { 
              success: false, 
              error: error.message, 
              sentTo: [], 
              timestamp: new Date() 
            } 
          }));
        promises.push(emailPromise);
      }
      
      // Add call promise
      printCallProgress('📞 Call Initiation', `Starting call to ${phoneNumber}...`);
      
      const callPromise = (async () => {
        try {
          const result = useRealCall 
            ? await blandAICallManager.initiateCall(phoneNumber, updatedContext.originalComplaint, extractedInfo, companyInfo)
            : await blandAICallManager.simulateCall(phoneNumber, updatedContext.originalComplaint, extractedInfo, companyInfo);
          return { type: 'call', result };
        } catch (error) {
          return { 
            type: 'call', 
            result: { 
              status: 'failed', 
              callId: null, 
              resolution: 'Call failed during execution', 
              nextSteps: 'Please try calling manually',
              error: error instanceof Error ? error.message : String(error)
            } 
          };
        }
      })();
      promises.push(callPromise);

      // Wait for both to complete
      try {
        console.log(chalk.blue('\n⏳ Waiting for both email and call to complete...'));
        const results = await Promise.allSettled(promises);
        
        // Process results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { type, result: actionResult } = result.value;
            
            if (type === 'email') {
              emailResult = actionResult;
              if (emailResult.success) {
                printEmailProgress('✅ Email Completed', `
Email sent to: ${emailResult.sentTo.join(', ')}
Message ID: ${emailResult.messageId || 'N/A'}
AI Generated: ${emailResult.aiGenerated ? 'Yes' : 'No'}
Tone: ${emailResult.tone || 'N/A'}
Expected Response: ${emailResult.estimatedResponseTime || 'N/A'}
                `);
              } else {
                printEmailProgress('❌ Email Failed', `Error: ${emailResult.error}`);
              }
            } else if (type === 'call') {
              callResult = actionResult;
              
              // Create call record
              callRecordId = await database.createCall({
                complaintId,
                userId,
                phoneNumber,
                companyName: companyInfo.name,
                callId: callResult.callId,
                status: callResult.status,
                resolution: callResult.resolution,
                nextSteps: callResult.nextSteps,
                referenceNumber: callResult.referenceNumber,
                duration: callResult.duration || 0,
                cost: callResult.cost || 0,
                transcript: callResult.transcript || [],
                ivrInteractions: callResult.ivrInteractions || [],
                error: callResult.error || null
              });
              
              console.log(chalk.green(`✓ Call record created with ID: ${callRecordId}`));
            }
            } else {
            console.error(chalk.red('Promise rejected:'), result.reason);
            }
        }

        console.log(chalk.green('\n✅ Both email and call operations completed'));
        
        } catch (error) {
        console.error(chalk.red('Error in parallel execution:'), error);
      }
    }

    // Send follow-up email if call was made and email is available
    if (callResult && emailData && (actionChoice === '2' || actionChoice === '3')) {
      const sendFollowUp = await prompt(chalk.cyan('Send follow-up email with call results? (y/n): '));
      
      if (sendFollowUp.toLowerCase() === 'y') {
        printEmailProgress('📧 Follow-up Email', 'Sending follow-up email with call results...');
        
        try {
          const followUpResult = await emailManager.sendFollowUpEmail(emailData, callResult);
          
          if (followUpResult.success) {
            printEmailProgress('✅ Follow-up Email Sent', `
Follow-up email sent to: ${followUpResult.sentTo.join(', ')}
Message ID: ${followUpResult.messageId || 'N/A'}
AI Generated: ${followUpResult.aiGenerated ? 'Yes' : 'No'}
            `);
          } else {
            printEmailProgress('❌ Follow-up Email Failed', `Error: ${followUpResult.error}`);
          }
        } catch (error) {
          console.error(chalk.red('Error sending follow-up email:'), error);
        }
      }
    }

    // Update complaint with final results
    const updateData: any = {
      status: 'completed',
      finalContext: updatedContext
    };

    if (callResult) {
      updateData.callResult = callResult;
      updateData.callRecordId = callRecordId;
    }

    if (emailResult) {
      updateData.emailResult = emailResult;
    }

    await database.updateComplaint(complaintId, updateData);

    // Show Final Results
    printSection('Pipeline Complete', `
✅ Complaint Resolution Pipeline Completed

Complaint ID: ${complaintId}
${callRecordId ? `Call Record ID: ${callRecordId}` : ''}
User: ${userContactDetails.name}
Company: ${companyInfo.name}
Questions Asked: ${updatedContext.conversationHistory.length}
Final Confidence: ${updatedContext.finalConfidence.toFixed(2)}

${emailResult ? `
Email Results:
Status: ${emailResult.success ? 'SUCCESS' : 'FAILED'}
${emailResult.success ? `Sent to: ${emailResult.sentTo.join(', ')}` : `Error: ${emailResult.error}`}
${emailResult.aiGenerated ? `AI Generated: Yes (${emailResult.tone})` : 'Template Based'}
${emailResult.estimatedResponseTime ? `Expected Response: ${emailResult.estimatedResponseTime}` : ''}
` : ''}

${callResult ? `
Call Results:
Status: ${callResult.status}
Call ID: ${callResult.callId || 'N/A'}
Resolution: ${callResult.resolution}
Next Steps: ${callResult.nextSteps}
${callResult.referenceNumber ? `Reference Number: ${callResult.referenceNumber}` : ''}
${callResult.duration ? `Duration: ${callResult.duration} seconds` : ''}
${callResult.cost ? `Cost: ${callResult.cost.toFixed(2)}` : ''}
` : ''}

The complaint has been processed and documented.
    `);

    if (callResult?.status === 'failed' || emailResult?.success === false) {
      console.log(chalk.yellow('\n⚠️ Some operations failed, but complaint has been documented for manual follow-up.'));
    } else {
      console.log(chalk.green('\n🎉 Pipeline execution completed successfully!'));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Error in pipeline:'));
    console.error(error);
    
    // Log pipeline error details
    const pipelineError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: error instanceof Error ? error.constructor.name : typeof error,
      timestamp: new Date().toISOString()
    };
    
    printSection('Pipeline Error', `
Error Type: ${pipelineError.type}
Error Message: ${pipelineError.message}
Stack Trace: ${pipelineError.stack || 'Not available'}
Timestamp: ${pipelineError.timestamp}

Please check:
1. Environment variables are properly set
2. API configurations are correct
3. Network connectivity is available
4. All required services are running
5. BlandAI API key is valid and has sufficient credits
6. Email configuration is properly set up
    `);
  } finally {
    // Clean up
    console.log(chalk.gray('\nCleaning up resources...'));
    
    // Close conversation manager
    try {
      conversationManager.close();
    } catch (error) {
      console.error('Error closing conversation manager:', error);
    }
    
    // Close email manager
    try {
      emailManager.close();
    } catch (error) {
      console.error('Error closing email manager:', error);
    }
    
    // Close readline interface
    try {
    rl.close();
    } catch (error) {
      console.error('Error closing readline:', error);
    }
    
    // Give some time for cleanup
    setTimeout(() => {
      console.log(chalk.blue('Pipeline execution finished.'));
      process.exit(0);
    }, 1000);
  }
}

// Validate environment and run test
console.log(chalk.blue('Validating environment...'));
validateEnvironment();
console.log(chalk.green('✓ Environment validation passed'));

runIntegratedTest().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});