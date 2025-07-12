const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory storage (for development without Redis)
const messages = [];
const sessions = new Map();

// Middleware
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());

// Store active WebSocket connections
const clients = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  console.log(`New WebSocket connection: ${clientId}`);

  // Store client connection
  clients.set(clientId, {
    ws: ws,
    userId: null,
    username: null
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'auth':
          // Authenticate user
          const client = clients.get(clientId);
          client.userId = data.userId;
          client.username = data.username;
          
          // Store user session in memory
          sessions.set(data.userId, {
            username: data.username,
            clientId: clientId,
            connectedAt: new Date().toISOString()
          });
          
          // Send authentication success
          ws.send(JSON.stringify({
            type: 'auth_success',
            userId: data.userId
          }));
          
          // Notify others about new user
          broadcastToOthers(clientId, {
            type: 'user_joined',
            username: data.username,
            userId: data.userId
          });
          
          // Send active users list
          const activeUsers = getActiveUsers();
          ws.send(JSON.stringify({
            type: 'active_users',
            users: activeUsers
          }));
          break;
          
        case 'message':
          // Store message in memory
          const messageId = uuidv4();
          const messageData = {
            id: messageId,
            userId: clients.get(clientId).userId,
            username: clients.get(clientId).username,
            content: data.content,
            timestamp: new Date().toISOString()
          };
          
          // Store in memory (keep last 100 messages)
          messages.unshift(messageData);
          if (messages.length > 100) {
            messages.pop();
          }
          
          // Broadcast message to all clients
          broadcast({
            type: 'message',
            data: messageData
          });
          break;
          
        case 'typing':
          // Broadcast typing indicator
          broadcastToOthers(clientId, {
            type: 'typing',
            userId: clients.get(clientId).userId,
            username: clients.get(clientId).username,
            isTyping: data.isTyping
          });
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process message'
      }));
    }
  });

  ws.on('close', () => {
    const client = clients.get(clientId);
    if (client && client.userId) {
      // Remove user session
      sessions.delete(client.userId);
      
      // Notify others about user leaving
      broadcastToOthers(clientId, {
        type: 'user_left',
        username: client.username,
        userId: client.userId
      });
    }
    
    clients.delete(clientId);
    console.log(`WebSocket connection closed: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${clientId}:`, error);
  });
});

// Helper functions
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

function broadcastToOthers(excludeClientId, data) {
  const message = JSON.stringify(data);
  clients.forEach((client, clientId) => {
    if (clientId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

function getActiveUsers() {
  const users = [];
  for (const [clientId, client] of clients) {
    if (client.userId && client.username) {
      users.push({
        userId: client.userId,
        username: client.username
      });
    }
  }
  return users;
}

// REST API endpoints
app.get('/api/messages', (req, res) => {
  res.json([...messages].reverse());
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    mode: 'development (no Redis)',
    connections: clients.size
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Chat Backend API',
    mode: 'Development (No Redis)',
    endpoints: {
      websocket: 'ws://localhost:3000',
      messages: '/api/messages',
      health: '/api/health'
    },
    frontend: 'http://localhost:4200'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
🚀 Development Server (No Redis) running on:
   - API: http://localhost:${PORT}
   - WebSocket: ws://localhost:${PORT}
   
📱 Frontend should be accessed at: http://localhost:4200

⚠️  This is a development server without Redis.
   For production, please use server.js with Redis installed.
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});