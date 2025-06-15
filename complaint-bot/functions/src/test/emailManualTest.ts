import 'dotenv/config';
import { EmailManager } from '../modules/notifications/emailManager';

async function main() {
  // Prepare the email data
  const emailManager = new EmailManager();
  await emailManager.initializeTransporter();

  const emailData = {
    complaintId: 'manual-test-complaint',
    userDetails: {
      name: 'Shweeta Patel',
      email: 'patelshweeta1744@gmail.com',
      phone: ''
    },
    companyInfo: {
      name: 'Manual Test Receiver',
      emails: ['shyamalnarang@gmail.com']
    },
    complaintDetails: {
      originalComplaint: 'I am so tired of this',
      extractedFields: {},
      conversationHistory: []
    },
    priority: 'medium' as 'medium',
    useAI: false // Use template-based email
  };

  console.log('🚀 Sending test email...');
  const result = await emailManager.sendComplaintEmail(emailData);
  console.log('✅ Email send result:', result);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 