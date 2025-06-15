import express from 'express';
import bodyParser from 'body-parser';
import { twiml as Twiml } from 'twilio';
import http from 'http';
import dotenv from 'dotenv';
import { setupBlandAIWebSocketServer } from './modules/callOrchestration/blandAIWebSocketServer';
import path from 'path';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['PUBLIC_URL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'BLAND_AI_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these variables in your .env file');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Use port 9000 to match your Cloudflare setup
const PORT = process.env.PORT || 9000;
const PUBLIC_URL = process.env.PUBLIC_URL!;

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve test.html at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

// TwiML endpoint for outbound call
app.post('/twiml-entrypoint', (req, res) => {
  console.log('TwiML entrypoint hit with body:', req.body);
  
  const twiml = new Twiml.VoiceResponse();
  
  // Configure the stream with proper parameters
  twiml
    .connect()
    .stream({
      url: `${PUBLIC_URL.replace('https', 'wss')}/blandai-ws`,
      track: 'inbound_track',
      name: 'blandai_stream'
    });
  
  // Add a brief initial message
  twiml.say('Connecting to AI assistant...');
  
  console.log('Generated TwiML:', twiml.toString());
  res.type('text/xml');
  res.send(twiml.toString());
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Setup WebSocket server
setupBlandAIWebSocketServer(server);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).send('Internal Server Error');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket URL: ${PUBLIC_URL.replace('https', 'wss')}/blandai-ws`);
  console.log('Environment variables:');
  console.log('- PUBLIC_URL:', PUBLIC_URL);
  console.log('- PORT:', PORT);
  console.log('- TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set');
  console.log('- TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set');
  console.log('- BLAND_AI_API_KEY:', process.env.BLAND_AI_API_KEY ? 'Set' : 'Not set');
}); 