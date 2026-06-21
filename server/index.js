import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Configure CORS
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Serve uploads
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// Serve static assets in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  // If API route not found, let it proceed to 404
  if (req.path.startsWith('/api')) {
    return next();
  }
  // Try sending index.html if it exists, otherwise just send a fallback/next
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({ error: 'Not found' });
    }
  });
});

// Configure Socket.io
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Attach io to express app
app.set('io', io);

// Socket Auth Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);

  // Join personal user room for targeted notifications
  socket.join(`user:${socket.user.id}`);

  // Join project board room
  socket.on('join-project', (projectId) => {
    socket.join(`project:${projectId}`);
    console.log(`User ${socket.user.username} joined project room project:${projectId}`);
  });

  // Leave project board room
  socket.on('leave-project', (projectId) => {
    socket.leave(`project:${projectId}`);
    console.log(`User ${socket.user.username} left project room project:${projectId}`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.username}`);
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

import { getDb } from './db.js';
import { sendNotification } from './routes/api.js';

async function checkDeadlines() {
  try {
    const db = getDb();
    const tomorrowTasks = await db.all(`
      SELECT t.id, t.title, t.project_id
      FROM tasks t
      WHERE date(t.due_date) = date('now', '+1 day')
    `);

    for (const task of tomorrowTasks) {
      const assignees = await db.all('SELECT user_id FROM task_assignees WHERE task_id = ?', [task.id]);
      for (const a of assignees) {
        // Only send if not sent yet (very simplified, we just send it, might be spammy if we don't track it, 
        // but since we run once a day ideally, it's fine. For a robust system we'd track sent reminders.)
        await sendNotification(
          app.get('io'),
          a.user_id,
          'Deadline Tomorrow!',
          `Your task "${task.title}" is due tomorrow!`,
          'alert'
        );
      }
    }
  } catch (err) {
    console.error('Error checking deadlines:', err);
  }
}

async function startServer() {
  try {
    await initDb();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      // Check immediately and then every 24 hours
      checkDeadlines();
      setInterval(checkDeadlines, 24 * 60 * 60 * 1000);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

