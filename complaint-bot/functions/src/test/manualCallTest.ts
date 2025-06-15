import 'dotenv/config';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { BlandAIClient } from '../modules/callOrchestration/blandAIClient';
import { ContactDetails } from '../types/entityResolver';
import { EnhancedComplaintContext } from '../types/followupQuestions';

async function main() {
  const args = process.argv.slice(2);
  let complaintId = '';
  let testPhone = '+919319300188';

  args.forEach(arg => {
    if (arg.startsWith('--complaintId=')) {
      complaintId = arg.split('=')[1];
    }
    if (arg.startsWith('--phone=')) {
      testPhone = arg.split('=')[1];
    }
  });

  if (!complaintId) {
    console.error('❌ Please provide --complaintId=<id>');
    process.exit(1);
  }

  console.log('\n🚀 Manual Call Test starting');
  console.log('Complaint ID:', complaintId);
  console.log('Test phone number:', testPhone);

  // Load complaint
  const complaintDoc = await db.collection('complaints').doc(complaintId).get();
  if (!complaintDoc.exists) {
    console.error('❌ Complaint not found');
    process.exit(1);
  }
  const data = complaintDoc.data()!;
  console.log('✅ Complaint loaded. Conversation turns:', (data.conversationHistory || []).length);

  // Build context
  const context: EnhancedComplaintContext = {
    originalComplaint: data.rawText,
    conversationHistory: data.conversationHistory || [],
    finalConfidence: data.finalConfidence || 0.5,
    complaintType: data.complaintType || 'GENERAL',
    extractedFields: data.extractedFields || {},
    userDetails: data.userDetails,
  } as any;

  const contactDetails: ContactDetails = {
    phoneNumbers: [testPhone],
    emails: [],
    source: 'known_database',
    lastUpdated: new Date()
  } as ContactDetails;

  // Use BlandAIClient to make the call
  const blandAIClient = new BlandAIClient();
  console.log('📞 Initiating call via BlandAIClient...');
  const result = await blandAIClient.placeCall({ phoneNumber: testPhone, context });
  console.log('✅ BlandAIClient returned:', result);
  console.log('🎉 Manual call test complete');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 