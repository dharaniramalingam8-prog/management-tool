# Antigravity Collaborative Kanban Tool

A premium, dark-themed, full-stack collaborative project management application (similar to Trello/Asana). This project features user authentication, group project boards, task assignment, checklist tracking, comments threads, real-time WebSocket synchronization via Socket.io, in-app notifications, and audit-logged activities.

---

## Key Features

1. **User Authentication System**:
   - Secure login & registration.
   - JWT-based authentication for HTTP routes and WebSocket handshakes.
   - Password encryption using `bcryptjs`.
2. **Dashboard & Project Management**:
   - Home metrics displaying total projects, active collaborators, and unread alerts.
   - Creation of new group projects.
   - Collaborator invitations via email.
3. **Interactive Kanban Boards**:
   - Interactive lists and cards structure.
   - Smooth Drag-and-Drop column/card rearrangement powered by `@hello-pangea/dnd`.
   - Live synchronization: Moving a card or editing lists automatically updates all connected clients instantly.
4. **Detailed Task Management Modals**:
   - Title, description, and metadata fields (due date, priority indicators, assignee selection).
   - Interactive checklists (sub-tasks progress tracking bar).
   - Comments thread for real-time team communication.
   - Collapsible activity audit feed logs showing exactly who did what and when.
5. **Real-time WebSocket Sync & In-app Notifications**:
   - Socket.io connection links client and server rooms.
   - Instant notifications slide-down alerts for assignments and project invitations.

---

## Project Structure & Architecture

The project has a unified monorepo structure:
- **`server/`**: The Node.js Express.js backend.
  - `db.js`: Initializes database schemas using `sqlite` + `sqlite3`.
  - `index.js`: Sets up Express middleware, API routing endpoints, and the Socket.io WebSocket server.
  - `middleware/auth.js`: Implements JWT verification wrapper.
  - `routes/auth.js`: Handles user accounts registration, login, and verification.
  - `routes/api.js`: Exposes REST CRUD endpoints for projects, lists, cards, checklists, comments, notifications, and logs.
- **`src/`**: The React + Vite client-side single page application.
  - `context/AuthContext.jsx` & `context/SocketContext.jsx`: State management providers for credentials and sockets.
  - `components/Auth.jsx`: Login / registration forms UI.
  - `components/Dashboard.jsx`: Main metrics portal and project creator.
  - `components/Board.jsx`: Kanban drag & drop board canvas.
  - `components/TaskModal.jsx`: Sidebar/overlay for detailed card management.
  - `index.css`: Glassmorphic, modern CSS styles and custom UI tokens.

---

## How to Get Started

### 1. Installation

Run this command at the root of the workspace to install both frontend and backend dependencies:
```bash
npm install
```

### 2. Running Locally

To launch both the client-side dev server (running on `http://localhost:5173`) and the Express backend server (running on `http://localhost:5000`) concurrently, execute:
```bash
npm run dev
```

The database (`dev.db`) will automatically initialize in the root folder with all schemas on first startup!

---

## Database Schema (SQLite)

- **`users`**: User records.
- **`projects`**: Group project details.
- **`project_members`**: Link table mapping user access to projects.
- **`lists`**: Columns inside projects.
- **`tasks`**: Cards inside lists.
- **`comments`**: Communication threads inside tasks.
- **`checklists`**: Sub-tasks checklist progress elements.
- **`notifications`**: User targeted alerts.
- **`activities`**: History log entries for project activities.
