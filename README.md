# Angular Chat Application with Redis and WebSocket

A real-time chat application built with Angular, Node.js, WebSocket (ws), and Redis for session management.

## Features

- Real-time messaging using WebSocket
- Redis-based session management
- Multi-instance server support in GCP
- User authentication
- Active users list
- Typing indicators
- Message history
- Responsive design

## Prerequisites

- Node.js (v14 or higher)
- Redis server running locally or accessible
- npm or yarn

## Installation

1. Clone the repository and navigate to the project folder:
```bash
cd /mnt/c/_Snow/Coding/angSite
```

2. Install all dependencies:
```bash
npm run install:all
```

This will install dependencies for:
- Root project (concurrently)
- Backend server
- Frontend Angular app

## Configuration

### Backend Configuration

1. Redis connection (backend/server.js):
   - Default: `redis://localhost:6379`
   - Set `REDIS_URL` environment variable for custom Redis URL

2. Session secret:
   - Set `SESSION_SECRET` environment variable
   - Default: 'your-secret-key' (change in production!)

3. Port:
   - Set `PORT` environment variable
   - Default: 3000

### Frontend Configuration

- WebSocket URL is configured in `frontend/src/app/services/websocket.service.ts`
- API URL is configured in `frontend/src/app/services/message.service.ts`

## Running the Application

### Development Mode

Start both backend and frontend:
```bash
npm start
```

This will:
- Start the Node.js backend server on http://localhost:3000
- Start the Angular dev server on http://localhost:4200

### Production Deployment (GCP)

For GCP deployment with multiple instances:

1. Configure Redis:
   - Use Google Cloud Memorystore for Redis
   - Update `REDIS_URL` to point to your Memorystore instance

2. Backend deployment:
   ```bash
   cd backend
   gcloud app deploy
   ```

3. Frontend deployment:
   - Build the Angular app: `cd frontend && npm run build`
   - Deploy the dist folder to Cloud Storage or App Engine

## Architecture

### Backend
- Express.js server with WebSocket support
- Redis for session storage and pub/sub
- REST API for message history

### Frontend
- Angular 16 with TypeScript
- RxJS for reactive programming
- WebSocket service for real-time communication
- Route guards for authentication

## API Endpoints

- `GET /api/messages` - Get last 100 messages
- `GET /api/health` - Health check endpoint
- WebSocket connection at `ws://localhost:3000`

## WebSocket Events

### Client to Server
- `auth` - Authenticate user
- `message` - Send a message
- `typing` - Send typing indicator

### Server to Client
- `auth_success` - Authentication successful
- `message` - New message received
- `active_users` - List of active users
- `user_joined` - User joined the chat
- `user_left` - User left the chat
- `typing` - Typing indicator from other users

## Folder Structure

```
angSite/
├── backend/
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   ├── guards/
│   │   │   └── models/
│   │   ├── index.html
│   │   └── styles.scss
│   ├── angular.json
│   └── package.json
├── package.json
└── README.md
```

## License

MIT