import express from 'express';
import bodyParser from 'body-parser';
import { twiml as Twiml } from 'twilio';
import http from 'http';
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import { ComplaintContext } from './types/inputHandler';
import { CompanyInfo, ContactDetails } from './types/entityResolver';
import { EnhancedComplaintContext } from './types/followupQuestions';
import { CallResult } from './types/callOrchestration';
import { inputHandler } from './modules/inputHandler';
import { entityResolver } from './modules/entityResolver';
import { followupQuestionFlow } from './modules/followupQuestions';
import { callOrchestrator } from './modules/callOrchestration';
import { loggingSystem } from './modules/logging';
import { SignupService, UserSignupData } from './modules/auth';
import { setupBlandAIWebSocketServer } from './modules/callOrchestration/blandAIWebSocketServer';
import multer from 'multer';
import { complaintResolutionSystem } from './index';
import { AudioProcessor } from './modules/inputHandler/audioProcessor';
import SigninService from './modules/auth/signin';
import cors from 'cors';
import { BlandAIClient } from './modules/callOrchestration/blandAIClient';
import { EmailManager } from './modules/notifications/emailManager';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();
app.use(cors());
app.options('*', cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const upload = multer();

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL!;

// Initialize services
const signupService = new SignupService();
const signinService = new SigninService();

// Go up 3 levels from dist to project root, then into front-end/resolve_buddy_ai/build
const frontendBuildPath = path.join(__dirname, '..', '..', '..', 'front-end', 'resolve_buddy_ai', 'dist');

console.log('Current directory:', __dirname);
console.log('Looking for frontend at:', frontendBuildPath);
console.log('Frontend exists?', fs.existsSync(frontendBuildPath));

// Debug: Directory explorer
const explorePath = (dir: string, level = 0) => {
  const indent = '  '.repeat(level);
  try {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      console.log(`${indent}${stats.isDirectory() ? '[D]' : '[F]'} ${item}`);
      if (stats.isDirectory() && level < 3 && !item.includes('node_modules')) {
        explorePath(fullPath, level + 1);
      }
    });
  } catch (e) {
    console.log(`${indent}[ERROR] Cannot read: ${dir}`);
  }
};
console.log('=== Directory Structure from app.js ===');
console.log('Starting from:', __dirname);
explorePath(path.join(__dirname, '..', '..', '..'), 0);

// Place your API routes here
// app.use('/api', yourApiRoutes);

// Serve static files if they exist
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(503).json({
      error: 'Frontend build not found',
      currentDir: __dirname,
      searchedPath: frontendBuildPath,
      hint: 'Frontend needs to be built first'
    });
  });
}

// Helper to format phone number to E.164 (US default)
function toE164(phone: string, defaultCountry = 'US'): string | null {
  if (!phone) return null;
  if (phone.startsWith('+')) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return null;
}

// Signup endpoint
app.post('/signup', async (req, res) => {
  try {
    const userData: UserSignupData = req.body;
    
    // Check if email is already registered
    const isEmailRegistered = await signupService.isEmailRegistered(userData.email);
    if (isEmailRegistered) {
      return res.status(400).json({
        success: false,
        error: 'Email is already registered'
      });
    }

    // Check if phone is already registered
    const isPhoneRegistered = await signupService.isPhoneRegistered(userData.phone);
    if (isPhoneRegistered) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is already registered'
      });
    }

    // Proceed with signup
    const result = await signupService.signup(userData);
    
    if (result.success && result.userId) {
      // Log successful signup
      await loggingSystem.logAction(
        result.userId,
        'user_signup',
        'auth',
        'success',
        { email: userData.email }
      );

      // Send welcome notification
      await loggingSystem.notifyUser(
        result.userId,
        loggingSystem.createStatusNotification(
          'Welcome to Complaint Resolution System',
          'Your account has been created successfully. You can now submit your complaints.',
          false
        )
      );
    }

    res.json(result);
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during signup'
    });
  }
});

// Submit complaint endpoint (API MODE - NON-BLOCKING)
app.post('/complaint', upload.fields([
  { name: 'text', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  console.log('\n🚀 ==> API ENDPOINT: /complaint called');
  console.log('📋 Request body fields:', Object.keys(req.body));
  console.log('📋 Request files:', req.files ? Object.keys(req.files) : 'No files');
  // Debug log: print follow-up fields
  console.log('🟢 [Debug] questionId:', req.body.questionId);
  console.log('🟢 [Debug] answer:', req.body.answer);
  console.log('🟢 [Debug] isFollowup:', req.body.isFollowup);
  
  try {
    const userId = req.body.userId || 'anonymous-user'; // Default user for testing
    let text = req.body.text;
    let imageBuffer: Buffer | undefined;
    let audioBuffer: Buffer | undefined;
    let audioMime: string | undefined;
    
    // Check if this is a follow-up request
    const isFollowup = req.body.isFollowup === 'true' || req.body.isFollowup === true;
    let complaintId = req.body.complaintId;
    
    console.log(`📋 Processing: ${isFollowup ? 'FOLLOW-UP' : 'NEW COMPLAINT'}`);
    console.log(`📋 Complaint ID: ${complaintId || 'Will be generated'}`);
    console.log(`📋 Text content: ${text ? text.substring(0, 100) + '...' : 'None'}`);

    // Handle image upload
    if (req.files && (req.files as any).image && (req.files as any).image[0]) {
      imageBuffer = (req.files as any).image[0].buffer;
      console.log('📋 Image uploaded, size:', imageBuffer.length);
    }

    // Handle audio upload
    if (req.files && (req.files as any).audio && (req.files as any).audio[0]) {
      audioBuffer = (req.files as any).audio[0].buffer;
      audioMime = (req.files as any).audio[0].mimetype;
      console.log('📋 Audio uploaded, size:', audioBuffer.length, 'type:', audioMime);
    }

    // For follow-up requests, verify the complaint exists
    if (isFollowup && complaintId) {
      try {
        const complaintDoc = await admin.firestore().collection('complaints').doc(complaintId).get();
        if (!complaintDoc.exists) {
          console.error('❌ Complaint document not found:', complaintId);
          return res.status(404).json({
            success: false,
            error: 'Complaint not found'
          });
        }
        console.log('✅ Existing complaint found for follow-up');
      } catch (error) {
        console.error('❌ Error checking complaint existence:', error);
        return res.status(500).json({
          success: false,
          error: 'Error checking complaint'
        });
      }
    }

    console.log('🔄 Starting unified complaint processing...');

    // Unified pipeline for both new complaints and follow-ups (API MODE)
    const result = await complaintResolutionSystem.processUnifiedComplaint({
      userId,
      text,
      image: imageBuffer,
      audio: audioBuffer,
      audioMime,
      isFollowup,
      complaintId,
      questionId: req.body.questionId,
      answer: req.body.answer
    });

    console.log('✅ Processing completed successfully');
    console.log(`📋 Result summary: ${result.nextQuestion ? 'Has next question' : 'Complete'}`);

    // Build response object
    const response: any = { 
      success: true,
      ...result 
    };

    console.log('📤 Sending response to frontend');
    res.json(response);

  } catch (error) {
    console.error('❌ Error processing complaint:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error processing complaint'
    });
  }
});

// TwiML endpoint for outbound call
app.post('/twiml-entrypoint', (req, res) => {
  console.log('📞 TwiML entrypoint hit');
  const response = new Twiml.VoiceResponse();
  response.connect().stream({ url: `${PUBLIC_URL.replace('https', 'wss')}/blandai-ws` });
  res.type('text/xml').send(response.toString());
});

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('❤️ Health check requested');
  res.send('OK');
});

// Signin endpoint
app.post('/signin', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Identifier and password are required' });
    }
    const result = await signinService.signin(identifier, password);
    if (result.success) {
      // Find userId by identifier (email or phone)
      let userRecord;
      if (identifier.startsWith('+')) {
        userRecord = await admin.auth().getUserByPhoneNumber(identifier);
      } else {
        userRecord = await admin.auth().getUserByEmail(identifier);
      }
      res.json({ success: true, idToken: result.idToken, userId: userRecord.uid });
    } else {
      res.status(401).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error during sign-in' });
  }
});

// Fetch user profile by ID
app.get('/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userDoc.data();
    res.json({
      id: userId,
      name: userData?.name,
      email: userData?.email,
      phone: userData?.phone,
      createdAt: userData?.createdAt || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Fetch all complaints for a user
app.get('/user/:id/complaints', async (req, res) => {
  try {
    const userId = req.params.id;
    const complaintsSnap = await admin.firestore().collection('complaints').where('userId', '==', userId).get();
    const complaints = complaintsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ complaints });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// Initiate AI phone call to company (FIXED with manualCallTest.ts logic)
app.post('/complaints/:id/initiate-call', async (req, res) => {
  const complaintId = req.params.id;
  console.log('\n🚀 ==> API ENDPOINT: /complaints/'+complaintId+'/initiate-call called');
  
  try {
    // 1. Load complaint document
    const complaintDoc = await admin.firestore().collection('complaints').doc(complaintId).get();
    if (!complaintDoc.exists) {
      console.error('❌ Complaint not found:', complaintId);
      return res.status(404).json({ success: false, error: 'Complaint not found' });
    }
    const complaintData = complaintDoc.data()!;
    console.log('✅ Complaint loaded. Conversation turns:', (complaintData.conversationHistory || []).length);

    // 2. Get phone number from stored contact details
    const companyPhone = complaintData.contactDetails?.phoneNumbers?.[0];
    if (!companyPhone) {
      console.error('❌ Company phone number not found in complaint data.');
      return res.status(400).json({ success: false, error: 'Company phone number not found. Contact details may not have been scraped.' });
    }

    // 3. Format phone number to E.164
    const formattedPhone = toE164(companyPhone);
    if (!formattedPhone) {
      console.error('❌ Phone number is not in valid E.164 format:', companyPhone);
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    // 4. Build context as per manualCallTest.ts
    const context: EnhancedComplaintContext = {
      originalComplaint: complaintData.rawText || '',
      conversationHistory: complaintData.conversationHistory || [],
      finalConfidence: complaintData.finalConfidence || 0.5,
      complaintType: complaintData.complaintType || 'GENERAL',
      extractedFields: complaintData.extractedFields || {},
      userDetails: complaintData.userDetails || {
        name: 'Unknown Customer',
        email: 'no-email@example.com',
        phone: 'No phone provided'
      },
    } as any;

    // 5. Use BlandAIClient to make the call
    const blandAIClient = new BlandAIClient();
    console.log('📞 Initiating call via BlandAIClient to:', formattedPhone);
    
    // Update call status to in_progress
    await admin.firestore().collection('complaints').doc(complaintId).update({ callStatus: 'in_progress' });
    const callResult = await blandAIClient.placeCall({ 
      phoneNumber: formattedPhone, 
      context 
    }).catch(err => {
      console.error('Call failed:', err);
      return {
        status: 'failed',
        callId: 'error',
        resolution: err.message,
        nextSteps: [],
        transcript: []
      };
    });
    
    console.log('✅ BlandAIClient returned:', callResult);

    // Update call status and transcript in Firestore
    await admin.firestore().collection('complaints').doc(complaintId).update({
      callStatus: callResult.status || 'completed',
      callTranscript: callResult.transcript || [],
      lastCallResult: callResult
    });

    // 6. Respond to client
    return res.json({ success: true, callResult });
    
  } catch (error) {
    console.error('❌ Error initiating call:', error);
    // Update call status to failed
    await admin.firestore().collection('complaints').doc(complaintId).update({ callStatus: 'failed' });
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Send complaint email endpoint (FIXED with defensive programming)
app.post('/send-email', async (req, res) => {
  try {
    const { complaintId } = req.body;
    if (!complaintId) {
      return res.status(400).json({ success: false, error: 'Missing complaintId' });
    }

    // Load complaint context from Firestore
    const complaintDoc = await admin.firestore().collection('complaints').doc(complaintId).get();
    if (!complaintDoc.exists) {
      return res.status(404).json({ success: false, error: 'Complaint not found' });
    }
    const complaintData = complaintDoc.data()!;

    // Get company name from stored data
    const companyName = complaintData.company || complaintData.companyInfo?.name || 'Unknown Company';

    // Get emails from stored contact details
    const emails = complaintData.contactDetails?.emails || [];
    if (!emails || emails.length === 0) {
      console.error('❌ Company email(s) not found in complaint data.');
      return res.status(400).json({ success: false, error: 'Company email not found. Contact details may not have been scraped.' });
    }

    // Build companyInfo object
    const companyInfo = {
      name: companyName,
      emails: Array.isArray(emails) ? emails : [emails].filter(Boolean),
      industry: complaintData.extractedFields?.industry || undefined,
      knownPolicies: complaintData.extractedFields?.knownPolicies || undefined,
    };

    // Ensure userDetails exists with proper defaults
    const userDetails = complaintData.userDetails || {
      name: 'Unknown Customer',
      email: 'no-email@example.com',
      phone: 'No phone provided'
    };

    // Build the email data with defensive checks
    const emailData = {
      complaintId,
      userDetails: {
        name: userDetails.name || 'Unknown Customer',
        email: userDetails.email || 'no-email@example.com',
        phone: userDetails.phone || 'No phone provided'
      },
      companyInfo: companyInfo,
      complaintDetails: {
        originalComplaint: complaintData.rawText || 'No complaint text provided',
        extractedFields: complaintData.extractedFields || {},
        conversationHistory: complaintData.conversationHistory || [],
      },
      priority: complaintData.priority || 'medium',
      useAI: true // Use AI to generate email content
    };

    console.log('DEBUG - Email Data Structure:', {
      hasComplaintId: !!emailData.complaintId,
      hasUserDetails: !!emailData.userDetails,
      hasCompanyInfo: !!emailData.companyInfo,
      companyName: emailData.companyInfo?.name,
      companyEmails: emailData.companyInfo?.emails,
      hasComplaintDetails: !!emailData.complaintDetails
    });

    // Send the email
    const emailManager = new EmailManager();
    await emailManager.initializeTransporter();
    
    const result = await emailManager.sendComplaintEmail(emailData).catch(err => {
      console.error('Email failed:', err);
      return {
        success: false,
        error: err.message,
        sentTo: [],
        timestamp: new Date()
      };
    });

    if (result.success) {
      return res.json({ success: true, message: 'Email sent successfully', result });
    } else {
      return res.status(500).json({ success: false, error: result.error || 'Failed to send email', result });
    }
  } catch (error) {
    console.error('Error in /send-email:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Execute both Bland AI call and email in parallel (FIXED with proper data usage)
app.post('/execute-both', async (req, res) => {
  try {
    const { complaintId } = req.body;
    if (!complaintId) {
      return res.status(400).json({ success: false, error: 'Missing complaintId' });
    }

    // Load complaint context from Firestore
    const complaintDoc = await admin.firestore().collection('complaints').doc(complaintId).get();
    if (!complaintDoc.exists) {
      return res.status(404).json({ success: false, error: 'Complaint not found' });
    }
    const complaintData = complaintDoc.data()!;

    // Get company name from stored data
    const companyName = complaintData.company || complaintData.companyInfo?.name || 'Unknown Company';

    // Get emails and phone from stored contact details
    const emails = complaintData.contactDetails?.emails || [];
    const companyPhone = complaintData.contactDetails?.phoneNumbers?.[0];

    // Validate that we have both email and phone
    if (!emails || emails.length === 0) {
      console.error('❌ Company email(s) not found in complaint data.');
      return res.status(400).json({ success: false, error: 'Company email not found. Contact details may not have been scraped.' });
    }
    if (!companyPhone) {
      console.error('❌ Company phone number not found in complaint data.');
      return res.status(400).json({ success: false, error: 'Company phone number not found. Contact details may not have been scraped.' });
    }

    // Format phone number to E.164
    const formattedPhone = toE164(companyPhone);
    if (!formattedPhone) {
      console.error('❌ Phone number is not in valid E.164 format:', companyPhone);
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    // Build companyInfo object
    const companyInfo = {
      name: companyName,
      emails: Array.isArray(emails) ? emails : [emails].filter(Boolean),
      industry: complaintData.extractedFields?.industry || undefined,
      knownPolicies: complaintData.extractedFields?.knownPolicies || undefined,
    };

    // Ensure userDetails exists with proper defaults
    const userDetails = complaintData.userDetails || {
      name: 'Unknown Customer',
      email: 'no-email@example.com',
      phone: 'No phone provided'
    };

    // Prepare data for both actions
    const emailData = {
      complaintId,
      userDetails: {
        name: userDetails.name || 'Unknown Customer',
        email: userDetails.email || 'no-email@example.com',
        phone: userDetails.phone || 'No phone provided'
      },
      companyInfo: companyInfo,
      complaintDetails: {
        originalComplaint: complaintData.rawText || 'No complaint text provided',
        extractedFields: complaintData.extractedFields || {},
        conversationHistory: complaintData.conversationHistory || [],
      },
      priority: complaintData.priority || 'medium',
      useAI: true
    };

    console.log('DEBUG - Company Info:', JSON.stringify(companyInfo, null, 2));
    console.log('DEBUG - User Details:', JSON.stringify(emailData.userDetails, null, 2));

    const emailManager = new EmailManager();
    await emailManager.initializeTransporter();
    const blandAIClient = new BlandAIClient();

    // Start both actions in parallel
    console.log('🚀 Triggering Bland AI call and sending email in parallel...');
    const callPromise = blandAIClient.placeCall({
      phoneNumber: formattedPhone,
      context: {
        originalComplaint: complaintData.rawText || '',
        conversationHistory: complaintData.conversationHistory || [],
        extractedFields: complaintData.extractedFields || {},
        userDetails: userDetails,
        finalConfidence: complaintData.finalConfidence || 0.5,
      }
    }).catch(err => {
      console.error('Call failed:', err);
      return {
        status: 'failed',
        callId: 'error',
        resolution: err.message,
        nextSteps: []
      };
    });

    const emailPromise = emailManager.sendComplaintEmail(emailData).catch(err => {
      console.error('Email failed:', err);
      return {
        success: false,
        error: err.message,
        sentTo: [],
        timestamp: new Date()
      };
    });

    // Wait for both to finish
    const [callResult, emailResult] = await Promise.all([callPromise, emailPromise]);

    console.log('✅ Call result:', callResult);
    console.log('✅ Email result:', emailResult);
    console.log('🎉 Both actions completed.');

    res.json({
      success: true,
      callResult,
      emailResult
    });
  } catch (error) {
    console.error('Error in /execute-both:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
setupBlandAIWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/complaint`);
  console.log('🔥 API MODE: Ready for frontend requests (no terminal prompts)');
});

export default app;
