import { orchestrateBlandAITwilioCall } from './src/modules/callOrchestration/blandAITwilioOrchestrator';

// === CONFIGURE THESE NUMBERS ===
const USER_NUMBER = '+65 92472802'; // Set your real user phone number
const REP_NUMBER = '+919319300188';  // Set your real rep phone number

async function main() {
  const complaintContext = {
    originalComplaint: 'My order was not delivered.',
    company: 'TestCo',
    product: 'Widget',
    issue: 'Delivery',
    customerDetails: {
      name: 'Test User',
      phone: USER_NUMBER,
      email: 'test@example.com'
    },
    conversationHistory: []
  };

  try {
    await orchestrateBlandAITwilioCall({
      repPhoneNumber: REP_NUMBER,
      userPhoneNumber: USER_NUMBER,
      complaintContext
    });
    console.log('Test completed. Check Twilio and Bland AI dashboards for call details.');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main(); 