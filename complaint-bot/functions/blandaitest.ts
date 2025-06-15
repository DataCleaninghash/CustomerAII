import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Get API key from environment variable
const BLAND_API_KEY = process.env.BLAND_AI_API_KEY;
const TO_NUMBER = "+919319300188"; // Your number

const conversationPrompt = `
You are calling XYZ Electronics customer care on behalf of the customer.

The customer has the following complaint:
"My new headphones are not working. Only one side is working and there is a buzzing noise."

Additional context from the conversation:
- Tried using a different cable and device, but the issue is still there.

Instructions for IVR handling:
1. When you hear the IVR system, wait for the options
2. If you hear "Press 1 for customer service", press 1
3. If you hear "Press 2 for technical support", press 2
4. If you hear "Press 3 for returns", press 3
5. If you hear "Press 4 to speak with an agent", press 4
6. If you hear "Press 0 to speak with an operator", press 0
7. Wait for each prompt to complete before pressing any key
8. If you're not sure which option to choose, press 0 for operator

Your goal is to get the issue resolved or a replacement initiated.
If they ask for any more details you don't have, say you'll follow up with the customer.
Thank them for their help.
`.trim();

async function testBlandCall() {
  if (!BLAND_API_KEY) {
    console.error('Error: BLAND_AI_API_KEY environment variable is not set');
    process.exit(1);
  }

  try {
    console.log('Initiating call to:', TO_NUMBER);
    const response = await axios.post(
      'https://api.bland.ai/v1/calls',
      {
        phone_number: TO_NUMBER,
        task: conversationPrompt,
        voice_id: "clara", // Optional: specify a voice
        temperature: 0.7, // Optional: control response creativity
        max_duration: 300, // Optional: maximum call duration in seconds
        detect_ivr: true, // Enable IVR detection
        detect_human: true, // Enable human detection
        wait_for_ivr: true, // Wait for IVR to finish before speaking
        wait_for_human: true // Wait for human to finish speaking
      },
      {
        headers: {
          'Authorization': `Bearer ${BLAND_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Call initiated successfully:', response.data);
  } catch (error) {
    console.error('Error initiating call:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
    }
  }
}

testBlandCall();
