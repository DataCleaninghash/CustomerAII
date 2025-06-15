import 'dotenv/config';
import * as admin from 'firebase-admin';
import { EmailManager } from '../modules/notifications/emailManager';
import { BlandAIClient } from '../modules/callOrchestration/blandAIClient';
import { ContactScraper } from '../modules/entityResolver/contactScraper';

// Helper to format phone number to E.164 (US default)
function toE164(phone: string, defaultCountry = 'US'): string | null {
  if (!phone) return null;
  if (phone.startsWith('+')) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return null;
}

async function main() {
  // Get complaintId from command line or hardcode for testing
  const args = process.argv.slice(2);
  let complaintId = args[0] || '';
  if (!complaintId) {
    console.error('❌ Please provide a complaintId as the first argument');
    process.exit(1);
  }

  // Initialize Firebase if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  // Load complaint context from Firestore
  const complaintDoc = await admin.firestore().collection('complaints').doc(complaintId).get();
  if (!complaintDoc.exists) {
    console.error('❌ Complaint not found:', complaintId);
    process.exit(1);
  }
  let complaintData = complaintDoc.data();

  // Always use the root-level 'company' field for company name
  let companyName = complaintData.company || 'Unknown Company';

  // Prepare initial emails and phone
  let emails =
    complaintData.companyEmails ||
    complaintData.extractedFields?.companyEmails ||
    complaintData.extractedFields?.emails ||
    [];
  let companyPhone = complaintData.companyPhone || complaintData.extractedFields?.companyPhone;

  // If either is missing, use ContactScraper
  if (!emails || emails.length === 0 || !companyPhone) {
    console.log('🔍 Missing contact info, using ContactScraper...');
    const contactScraper = new ContactScraper();
    const scraped = await contactScraper.scrapeContactDetails(companyName);
    if ((!emails || emails.length === 0) && scraped.emails && scraped.emails.length > 0) {
      emails = scraped.emails;
      console.log('✅ Scraped emails:', emails);
    }
    if (!companyPhone && scraped.phoneNumbers && scraped.phoneNumbers.length > 0) {
      companyPhone = scraped.phoneNumbers[0];
      console.log('✅ Scraped phone number:', companyPhone);
    }
  }

  if (!emails || emails.length === 0) {
    console.error('❌ Company email(s) not found even after scraping.');
    process.exit(1);
  }
  if (!companyPhone) {
    console.error('❌ Company phone number not found even after scraping.');
    process.exit(1);
  }

  // Format phone number to E.164
  const formattedPhone = toE164(companyPhone);
  if (!formattedPhone) {
    console.error('❌ Scraped phone number is not in valid E.164 format:', companyPhone);
    process.exit(1);
  }

  // Build companyInfo object robustly with proper defensive checks
  const companyInfo = {
    name: (typeof companyName === 'string' && companyName.trim()) ? companyName : 'Unknown Company',
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

  // Prepare data for both actions with comprehensive defensive checks
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

  // Final validation and debug logging
  console.log('DEBUG - Company Info:', JSON.stringify(companyInfo, null, 2));
  console.log('DEBUG - User Details:', JSON.stringify(emailData.userDetails, null, 2));
  console.log('DEBUG - Email Data Structure:', {
    hasComplaintId: !!emailData.complaintId,
    hasUserDetails: !!emailData.userDetails,
    hasCompanyInfo: !!emailData.companyInfo,
    companyName: emailData.companyInfo?.name,
    hasComplaintDetails: !!emailData.complaintDetails,
    priority: emailData.priority,
    useAI: emailData.useAI
  });

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
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});