import { Server } from 'http';
import { WebSocketServer } from 'ws';
import axios from 'axios';
import winston from 'winston';
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { verifyToken } from '../auth/tokenVerifier';
import { CallRepository } from '../database/callRepository';
import { MetricsCollector } from '../monitoring/metricsCollector';
import { HealthCheck } from '../monitoring/healthCheck';
import { ConfigManager } from '../config/configManager';
import { BlandAIError } from '../errors/blandAIError';
import { BlandAIResponse, CallStatus, IVRInteraction } from '../../types';

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Initialize configuration
const config = ConfigManager.getConfig();
const BLAND_AI_API_KEY = config.apiKeys.blandAi;
const MAX_RETRIES = config.maxRetries;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100;

// Initialize repositories and services
const callRepository = new CallRepository();
const metricsCollector = new MetricsCollector();
const healthCheck = new HealthCheck();

// Rate limiter
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Simple in-memory rate limiter for WebSocket connections
class WebSocketRateLimiter {
  private requests: Map<string, number[]> = new Map();

  isRateLimited(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    
    // Get existing requests for this IP
    const ipRequests = this.requests.get(ip) || [];
    
    // Filter out old requests
    const recentRequests = ipRequests.filter(time => time > windowStart);
    
    // Check if rate limit exceeded
    if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
      return true;
    }
    
    // Add new request
    recentRequests.push(now);
    this.requests.set(ip, recentRequests);
    
    return false;
  }
}

const rateLimiter = new WebSocketRateLimiter();

async function monitorCall(callId: string): Promise<void> {
  try {
    const response = await axios.get(`https://api.bland.ai/v1/calls/${callId}`, {
      headers: {
        'Authorization': `Bearer ${BLAND_AI_API_KEY}`
      }
    });

    const callData = response.data;
    logger.info('Call Status Update', {
      callId,
      status: callData.status,
      transcript: callData.transcript
    });

    if (callData.ivr_interactions) {
      logger.info('IVR Interactions', {
        callId,
        interactions: callData.ivr_interactions
      });
    }

    // Update call status in database
    await callRepository.updateCallStatus(callId, {
      call_id: callId,
      status: callData.status,
      transcript: callData.transcript || [],
      ivr_interactions: callData.ivr_interactions || [],
      lastUpdated: new Date()
    });

    // Collect metrics
    metricsCollector.recordCallMetrics(callId, callData);

  } catch (error) {
    logger.error('Error monitoring call:', {
      callId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new BlandAIError('MONITORING_ERROR', 'Failed to monitor call', true);
  }
}

export async function processAudioWithBlandAI(audioData: Buffer, callId: string): Promise<BlandAIResponse> {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      logger.info('Processing audio with Bland AI', { callId });
      
      const response = await axios.post('https://api.bland.ai/v1/audio/process', 
        {
          audio: audioData.toString('base64'),
          detect_ivr: true,
          detect_human: true,
          wait_for_ivr: true,
          wait_for_human: true,
          call_id: callId,
          context: {
            task: `
              You are an AI assistant calling customer service on behalf of a customer.
              
              Your capabilities:
              1. You can detect when you're in an IVR system
              2. You can listen to IVR prompts and understand the options
              3. You can press DTMF keys to navigate the IVR
              4. You can detect when you're talking to a human
              5. You can have natural conversations with human agents
              
              Your goals:
              1. If you detect an IVR:
                 - Listen carefully to the options
                 - Choose the most appropriate option for customer service/technical support
                 - Press the corresponding DTMF key
                 - Wait for the next prompt
                 - Log each IVR interaction with the prompt and selected option
              
              2. If you detect a human:
                 - Introduce yourself as calling on behalf of the customer
                 - Explain the customer's issue clearly
                 - Get a resolution or clear next steps
                 - Get a reference number if possible
                 - Thank them for their help
              
              Always be polite and professional. If you're unsure about an IVR option,
              choose the one that seems most relevant to customer service or technical support.
            `.trim()
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BLAND_AI_API_KEY}`
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      logger.info('Bland AI Response', {
        callId,
        isIvr: response.data.is_ivr,
        isHuman: response.data.is_human,
        dtmfKey: response.data.dtmf_key
      });
      
      // Start monitoring the call if we have a call ID
      if (callId) {
        await monitorCall(callId);
      }
      
      return {
        audio: Buffer.from(response.data.audio, 'base64'),
        text: response.data.text,
        is_ivr: response.data.is_ivr || false,
        is_human: response.data.is_human || false,
        dtmf_key: response.data.dtmf_key
      };
    } catch (error) {
      retries++;
      
      if (error instanceof BlandAIError && !error.retryable) {
        throw error;
      }
      
      if (retries === MAX_RETRIES) {
        logger.error('Max retries reached for audio processing', {
          callId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw new BlandAIError('MAX_RETRIES_EXCEEDED', 'Failed to process audio after max retries', false);
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }
  
  throw new BlandAIError('UNKNOWN_ERROR', 'Failed to process audio', false);
}

export function setupBlandAIWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server, 
    path: '/blandai-ws',
    perMessageDeflate: true,
    maxPayload: 1024 * 1024 // 1MB max payload
  });

  // Health check endpoint
  server.on('request', (req, res) => {
    if (req.url === '/health') {
      healthCheck.check().then(status => {
        res.writeHead(status.healthy ? 200 : 503);
        res.end(JSON.stringify(status));
      });
    }
  });

  wss.on('connection', async (ws, req) => {
    try {
      // Verify authentication
      const token = req.headers['authorization'];
      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      const user = await verifyToken(token);
      if (!user) {
        ws.close(1008, 'Invalid token');
        return;
      }

      logger.info('New WebSocket connection established', {
        userId: user.id,
        ip: req.socket.remoteAddress
      });
      
      // Apply rate limiting
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (rateLimiter.isRateLimited(clientIp)) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
      
      // Send initial greeting
      const greeting = {
        event: 'start',
        streamSid: 'initial',
        start: {
          streamSid: 'initial',
          callSid: 'initial',
          tracks: ['inbound', 'outbound']
        }
      };
      ws.send(JSON.stringify(greeting));
      logger.info('Sent initial greeting');

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          logger.debug('Received WebSocket message', { message });

          if (message.event === 'media') {
            const { media } = message;
            logger.debug('Processing media chunk', { chunk: media.chunk });
            
            // Process audio with Bland AI
            const response = await processAudioWithBlandAI(
              Buffer.from(media.payload, 'base64'),
              message.callSid
            );
            
            // Log what Bland AI detected
            if (response.is_ivr) {
              logger.info('IVR detected', {
                callSid: message.callSid,
                dtmfKey: response.dtmf_key
              });
            } else if (response.is_human) {
              logger.info('Human detected', {
                callSid: message.callSid,
                response: response.text
              });
            }
            
            // Send response back
            const responseMessage = {
              event: 'media',
              streamSid: message.streamSid,
              media: {
                payload: response.audio.toString('base64')
              }
            };
            
            // If in IVR mode and DTMF key is available, send it
            if (response.is_ivr && response.dtmf_key) {
              const dtmfMessage = {
                event: 'dtmf',
                streamSid: message.streamSid,
                dtmf: {
                  digit: response.dtmf_key
                }
              };
              ws.send(JSON.stringify(dtmfMessage));
              logger.info('Sent DTMF key', { dtmfKey: response.dtmf_key });
            }
            
            ws.send(JSON.stringify(responseMessage));
            logger.debug('Sent audio response back');
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          const errorMessage = {
            event: 'error',
            streamSid: 'error',
            error: {
              message: 'Error processing audio'
            }
          };
          ws.send(JSON.stringify(errorMessage));
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket connection closed');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

    } catch (error) {
      logger.error('Error in WebSocket connection:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      ws.close(1011, 'Internal server error');
    }
  });

  logger.info('WebSocket server setup complete');
}
