const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const redis = require('redis');
const cors = require('cors');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Redis client setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Middleware
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());

// Session configuration with Redis store
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

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
          
          // Store user session in Redis
          await redisClient.set(`user:${data.userId}`, JSON.stringify({
            username: data.username,
            clientId: clientId,
            connectedAt: new Date().toISOString()
          }), {
            EX: 86400 // Expire after 24 hours
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
          const activeUsers = await getActiveUsers();
          ws.send(JSON.stringify({
            type: 'active_users',
            users: activeUsers
          }));
          break;
          
        case 'message':
          // Store message in Redis
          const messageId = uuidv4();
          const messageData = {
            id: messageId,
            userId: clients.get(clientId).userId,
            username: clients.get(clientId).username,
            content: data.content,
            timestamp: new Date().toISOString()
          };
          
          // Store in Redis list (last 100 messages)
          await redisClient.lPush('messages', JSON.stringify(messageData));
          await redisClient.lTrim('messages', 0, 99);
          
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

  ws.on('close', async () => {
    const client = clients.get(clientId);
    if (client && client.userId) {
      // Remove user session from Redis
      await redisClient.del(`user:${client.userId}`);
      
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

async function getActiveUsers() {
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
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await redisClient.lRange('messages', 0, 99);
    const parsedMessages = messages.map(msg => JSON.parse(msg)).reverse();
    res.json(parsedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    redis: redisClient.isOpen,
    connections: clients.size
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server is ready`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    await redisClient.quit();
    console.log('HTTP server closed');
  });
});