import { createServer } from 'http';
import { setupBlandAIWebSocketServer } from './modules/callOrchestration/blandAIWebSocketServer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create HTTP server
const server = createServer();

// Setup WebSocket server
setupBlandAIWebSocketServer(server);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
🚀 Bland AI WebSocket Server Started
📡 Port: ${PORT}
🔗 WebSocket URL: ws://localhost:${PORT}/blandai-ws
📝 Health Check: http://localhost:${PORT}/health
  `);
}); 