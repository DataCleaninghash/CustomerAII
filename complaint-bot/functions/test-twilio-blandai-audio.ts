import express from 'express';
import { twiml as Twiml } from 'twilio';
import http from 'http';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ws = require('ws');
import dotenv from 'dotenv';
import twilio from 'twilio';
import { execSync } from 'child_process';
import fs from 'fs';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.TEST_PORT || 4000;
const TEST_NUMBER = '+919319300188'; // Your test number
const PUBLIC_URL: string = (process.env.PUBLIC_URL as string) || 'https://your-ngrok-url';
const TWILIO_PHONE_NUMBER: string = (process.env.TWILIO_PHONE_NUMBER as string) || '+15005550006';

// Twilio client
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// TwiML endpoint for outbound call
app.post('/twiml-entrypoint', (req, res) => {
  console.log('TwiML entrypoint hit (test)');
  const response = new Twiml.VoiceResponse();
  response.connect().stream({ url: `${PUBLIC_URL.replace('https', 'wss')}/blandai-ws-test` });
  res.type('text/xml').send(response.toString());
});

// Helper: Generate PCM audio from text using eSpeak (must be installed)
function generatePCMFromText(text: string, outPath: string) {
  // eSpeak must be installed: https://espeak.sourceforge.net/
  // This command generates a WAV file, then we convert to raw PCM
  execSync(`espeak "${text}" --stdout > temp_test.wav`);
  // Convert WAV to 16-bit PCM, 8kHz mono
  execSync(`ffmpeg -y -i temp_test.wav -ar 8000 -ac 1 -f s16le ${outPath}`);
  fs.unlinkSync('temp_test.wav');
}

// WebSocket server for test audio streaming
const server = http.createServer(app);
const wss = new ws.Server({ noServer: true });

wss.on('connection', (socket: any) => {
  console.log('WebSocket connection established for test');
  // Simulate Bland AI: generate complaint context audio and stream it
  const complaintText = "Hello, I am calling on behalf of a customer. The complaint is: My Nintendo Switch is not charging and support is not responding. Please assist.";
  const pcmPath = 'blandai_test.pcm';
  try {
    generatePCMFromText(complaintText, pcmPath);
    const pcmData = fs.readFileSync(pcmPath);
    let offset = 0;
    const chunkSize = 320;
    const sendChunk = () => {
      if (offset >= pcmData.length) {
        socket.close();
        fs.unlinkSync(pcmPath);
        console.log('Finished streaming complaint context audio.');
        return;
      }
      const chunk = pcmData.slice(offset, offset + chunkSize);
      const msg = JSON.stringify({
        event: 'media',
        media: {
          payload: chunk.toString('base64')
        }
      });
      socket.send(msg);
      offset += chunkSize;
      setTimeout(sendChunk, 20);
    };
    setTimeout(sendChunk, 1000); // Wait 1s before starting audio
  } catch (err) {
    console.error('Error generating or sending complaint context audio:', err);
    socket.close();
  }
});

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/blandai-ws-test') {
    wss.handleUpgrade(request, socket, head, (wsocket) => {
      wss.emit('connection', wsocket, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);
  // Place a test call to your test number
  try {
    const call = await client.calls.create({
      to: TEST_NUMBER,
      from: TWILIO_PHONE_NUMBER,
      url: `${PUBLIC_URL}/twiml-entrypoint`,
      method: 'POST'
    });
    console.log('Test call initiated. Call SID:', call.sid);
    console.log('Answer your phone to hear the test TTS audio.');
  } catch (err) {
    console.error('Error placing test call:', err);
  }
}); 