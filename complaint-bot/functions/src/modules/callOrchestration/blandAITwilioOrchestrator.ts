import twilio from 'twilio';
import axios from 'axios';
import 'dotenv/config';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const BLAND_AI_API_URL = process.env.BLAND_AI_API_URL || 'https://api.bland.ai/v1';
const BLAND_AI_API_KEY = process.env.BLAND_AI_API_KEY;

if (!TWILIO_ACCOUNT_SID) throw new Error('TWILIO_ACCOUNT_SID is not set!');
if (!TWILIO_AUTH_TOKEN) throw new Error('TWILIO_AUTH_TOKEN is not set!');
if (!TWILIO_PHONE_NUMBER) {
    throw new Error('TWILIO_PHONE_NUMBER is not configured');
}
if (!BLAND_AI_API_KEY) throw new Error('BLAND_AI_API_KEY is not set!');

console.log('TWILIO_PHONE_NUMBER:', TWILIO_PHONE_NUMBER);

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

export interface ComplaintContext {
  [key: string]: any;
}

export async function orchestrateBlandAITwilioCall({
  repPhoneNumber,
  userPhoneNumber,
  complaintContext
}: {
  repPhoneNumber: string;
  userPhoneNumber: string;
  complaintContext: ComplaintContext;
}) {
  // 1. Start call to rep via Twilio
  const repCall = await client.calls.create({
    to: repPhoneNumber,
    from: TWILIO_PHONE_NUMBER as string,
    // TwiML app or webhook that connects to media stream for Bland AI
    url: `${process.env.PUBLIC_URL}/twilio/rep-twiml?contextId=CTXID` // Replace with your TwiML logic
  });
  console.log('Rep call started, SID:', repCall.sid);

  // 2. Start media stream to Bland AI (simulate for now)
  await startBlandAIMediaStream(repCall.sid, complaintContext);

  // 3. Simulate fallback detection (in real use, webhook or phrase from Bland AI)
  const fallbackNeeded = await waitForFallbackSignal(repCall.sid);
  if (fallbackNeeded) {
    // 4. Put rep on hold
    await client.calls(repCall.sid).update({
      url: `${process.env.PUBLIC_URL}/twilio/hold-twiml` // TwiML for hold music
    });
    console.log('Rep put on hold');

    // 5. Call user for missing info
    const userCall = await client.calls.create({
      to: userPhoneNumber,
      from: TWILIO_PHONE_NUMBER as string,
      url: `${process.env.PUBLIC_URL}/twilio/user-twiml?contextId=CTXID` // TwiML for IVR or Bland AI
    });
    console.log('User call started, SID:', userCall.sid);

    // 6. Wait for user to provide info (simulate for now)
    const newInfo = await waitForUserInfo(userCall.sid);
    // 7. Update context
    Object.assign(complaintContext, newInfo);

    // 8. Hang up user call
    await client.calls(userCall.sid).update({ status: 'completed' });
    console.log('User call ended');

    // 9. Resume rep call
    await client.calls(repCall.sid).update({
      url: `${process.env.PUBLIC_URL}/twilio/rep-twiml?contextId=CTXID` // Resume streaming to Bland AI
    });
    console.log('Rep call resumed');
    // Optionally, notify Bland AI of updated context
    await updateBlandAIContext(repCall.sid, complaintContext);
  }

  // 10. Wait for call to end, save transcript/result (simulate)
  await waitForCallToEnd(repCall.sid);
  console.log('Rep call ended, transcript/result saved');
}

// --- Helper stubs (replace with real implementations) ---
async function startBlandAIMediaStream(callSid: string, context: ComplaintContext) {
  // In real use, connect Twilio Media Streams to Bland AI and send context
  console.log('Starting media stream to Bland AI for call', callSid, 'with context', context);
}

async function waitForFallbackSignal(callSid: string): Promise<boolean> {
  // In real use, listen for webhook or phrase from Bland AI
  console.log('Waiting for fallback signal on call', callSid);
  // Simulate fallback needed after 10 seconds
  await new Promise(res => setTimeout(res, 10000));
  return true;
}

async function waitForUserInfo(callSid: string): Promise<any> {
  // In real use, collect info via IVR or Bland AI
  console.log('Waiting for user info on call', callSid);
  // Simulate user providing info after 10 seconds
  await new Promise(res => setTimeout(res, 10000));
  return { order_number: '123456' };
}

async function updateBlandAIContext(callSid: string, context: ComplaintContext) {
  // In real use, send updated context to Bland AI
  console.log('Updating Bland AI context for call', callSid, context);
}

async function waitForCallToEnd(callSid: string) {
  // In real use, listen for Twilio call status events
  console.log('Waiting for call', callSid, 'to end');
  await new Promise(res => setTimeout(res, 10000));
} 