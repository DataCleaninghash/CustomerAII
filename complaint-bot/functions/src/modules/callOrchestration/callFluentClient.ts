import axios from 'axios';
import * as functions from 'firebase-functions';

const CALLFLUENT_API_KEY = process.env.CALLFLUENT_API_KEY || '';
const CALLFLUENT_BASE_URL = 'https://api.callfluent.com/v1'; // Replace with actual base URL

function getHeaders() {
  return {
    'Authorization': `Bearer ${CALLFLUENT_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// 1. Start the scenario
export async function startComplaintResolutionScenario({
  repPhoneNumber,
  userPhoneNumber,
  complaintContext,
  webhookUrl
}: {
  repPhoneNumber: string;
  userPhoneNumber: string;
  complaintContext: any;
  webhookUrl: string;
}) {
  const response = await axios.post(
    `${CALLFLUENT_BASE_URL}/scenarios/complaint-resolution/start`,
    {
      rep_phone: repPhoneNumber,
      user_phone: userPhoneNumber,
      context: complaintContext,
      webhook_url: webhookUrl,
    },
    { headers: getHeaders() }
  );
  return response.data;
}

// 2. Handle fallback webhook and trigger fallback user call
export async function handleCallFluentFallbackWebhook(req, res) {
  const event = req.body;
  const { sessionId, missingFields, userPhoneNumber } = event;
  try {
    // Trigger fallback user call
    const collectResp = await axios.post(
      `${CALLFLUENT_BASE_URL}/sessions/${sessionId}/collect-user-info`,
      {
        user_phone: userPhoneNumber,
        missing_fields: missingFields,
      },
      { headers: getHeaders() }
    );
    res.status(200).json({ status: 'fallback triggered', collectResp: collectResp.data });
  } catch (error: any) {
    console.error('Error triggering fallback user call:', error?.response?.data || error?.message || 'Unknown error');
    res.status(500).json({ error: 'Failed to trigger fallback user call' });
  }
}

// 3. Update session with new info and resume rep call
export async function resumeRepCallWithNewInfo({
  sessionId,
  updatedContext
}: {
  sessionId: string;
  updatedContext: any;
}) {
  const response = await axios.post(
    `${CALLFLUENT_BASE_URL}/sessions/${sessionId}/resume-rep-call`,
    {
      context: updatedContext,
    },
    { headers: getHeaders() }
  );
  return response.data;
}

// 4. Example Firebase Function webhook handler
export const callFluentWebhook = functions.https.onRequest(async (req, res) => {
  const event = req.body;
  console.log('Received CallFluent webhook:', event);

  if (event.type === 'fallback_needed') {
    // Fallback: trigger user call for missing info
    await handleCallFluentFallbackWebhook(req, res);
    return;
  }

  if (event.type === 'user_info_collected') {
    // Resume rep call with updated context
    const { sessionId, updatedContext } = event;
    try {
      const resumeResp = await resumeRepCallWithNewInfo({ sessionId, updatedContext });
      res.status(200).json({ status: 'rep call resumed', resumeResp });
    } catch (error: any) {
      console.error('Error resuming rep call:', error?.response?.data || error?.message || 'Unknown error');
      res.status(500).json({ error: 'Failed to resume rep call' });
    }
    return;
  }

  // Handle other webhook events as needed
  res.status(200).send('OK');
}); 