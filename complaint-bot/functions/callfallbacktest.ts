import { FallbackHandler } from './src/modules/callOrchestration/fallbackHandler';
import { EnhancedComplaintContext } from './src/types/followupQuestions';
import { TwilioController } from './src/modules/callOrchestration/twilioController';

// === CONFIGURE THESE NUMBERS ===
const USER_NUMBER = '+917678114099'; // Your phone (user)
const REP_NUMBER = '+919319300188';  // Your other phone (customer care rep)

async function main() {
  const twilioController = new TwilioController();
  const fallbackHandler = new FallbackHandler(twilioController);

  // Simulate a call SID (in real use, this would come from Twilio's webhook)
  // For a real test, you may want to initiate a call to the rep and get the callSid from Twilio's response/webhook.
  const callSid = 'SIMULATED_CALL_SID'; // Replace with real callSid if available

  // Simulate context with user number
  const context: EnhancedComplaintContext = {
    originalComplaint: 'My order was not delivered.',
    company: 'TestCo',
    product: 'Widget',
    issue: 'Delivery',
    customerDetails: {
      name: 'Test User',
      phone: USER_NUMBER,
      email: 'test@example.com'
    },
    conversationHistory: [],
    finalConfidence: 0
  };

  // Simulate missing info
  const missingInfo = ['order_number'];
  const complaintId = 'complaint-realtest-001';

  try {
    // 1. Place a call to the rep (simulate customer care call)
    console.log('Placing call to customer care rep...');
    // You may want to use twilioController to place a real call and get the callSid
    // For now, we assume callSid is available

    // 2. Trigger fallback (should put rep on hold, call user, then resume rep)
    try {
      const result = await fallbackHandler.handleFallback(callSid, context, missingInfo, complaintId);
    console.log('=== Fallback Test Result ===');
      console.log(result);
    } catch (error) {
      console.error('Fallback handling failed:', error);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main();
