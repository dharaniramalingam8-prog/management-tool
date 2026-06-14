import express from 'express';
import { getDb } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Helper: check if user is a member of project
async function checkMember(projectId, userId) {
  const db = getDb();
  // Check if owner
  const project = await db.get('SELECT id FROM projects WHERE id = ? AND owner_id = ?', [projectId, userId]);
  if (project) return true;

  // Check if member
  const member = await db.get(
    'SELECT project_id FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
  return !!member;
}

// Helper: Log activities
async function logActivity(projectId, taskId, userId, content) {
  try {
    const db = getDb();
    await db.run(
      'INSERT INTO activities (project_id, task_id, user_id, content) VALUES (?, ?, ?, ?)',
      [projectId, taskId || null, userId, content]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

// Helper: Send live notifications
async function sendNotification(io, userId, title, content, type) {
  try {
    const db = getDb();
    const result = await db.run(
      'INSERT INTO notifications (user_id, title, content, type, is_read) VALUES (?, ?, ?, ?, 0)',
      [userId, title, content, type]
    );
    const notificationId = result.lastID;
    
    if (io) {
      // Send real-time notification to user's personal room
      io.to(`user:${userId}`).emit('new-notification', {
        id: notificationId,
        user_id: userId,
        title,
        content,
        type,
        is_read: 0,
        created_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

// --- PROJECTS ---

// Get all projects user belongs to
router.get('/projects', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const projects = await db.all(`
      SELECT DISTINCT p.*, u.username as owner_name,
             (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      LEFT JOIN project_members pm ON p.id = pm.project_id
      WHERE p.owner_id = ? OR pm.user_id = ?
      ORDER BY p.created_at DESC
    `, [req.user.id, req.user.id]);
    
    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Server error fetching projects' });
  }
});

// Create project
router.post('/projects', authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const db = getDb();
    // Insert project
    const result = await db.run(
      'INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)',
      [name, description || '', req.user.id]
    );
    const projectId = result.lastID;

    // Add owner to members
    await db.run(
      'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
      [projectId, req.user.id]
    );

    // Create default lists
    const defaultLists = ['To Do', 'In Progress', 'Done'];
    for (let i = 0; i < defaultLists.length; i++) {
      await db.run(
        'INSERT INTO lists (project_id, name, position) VALUES (?, ?, ?)',
        [projectId, defaultLists[i], i]
      );
    }

    await logActivity(projectId, null, req.user.id, 'created the project');

    const newProject = await db.get('SELECT * FROM projects WHERE id = ?', [projectId]);
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Server error creating project' });
  }
});

// Get single project details (board view data)
router.get('/projects/:id', authMiddleware, async (req, res) => {
  const projectId = req.params.id;
  try {
    const isJoined = await checkMember(projectId, req.user.id);
    if (!isJoined) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const db = getDb();
    
    // Project details
    const project = await db.get(`
      SELECT p.*, u.username as owner_name 
      FROM projects p 
      JOIN users u ON p.owner_id = u.id 
      WHERE p.id = ?
    `, [projectId]);

    // Members
    const members = await db.all(`
      SELECT u.id, u.username, u.email 
      FROM users u 
      JOIN project_members pm ON u.id = pm.user_id 
      WHERE pm.project_id = ?
    `, [projectId]);

    // Lists
    const lists = await db.all(`
      SELECT * FROM lists WHERE project_id = ? ORDER BY position ASC
    `, [projectId]);

    // Tasks (with assignee details)
    const tasks = await db.all(`
      SELECT t.*, u.username as assignee_name, u.email as assignee_email
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.list_id IN (SELECT id FROM lists WHERE project_id = ?)
      ORDER BY t.position ASC
    `, [projectId]);

    // For each task, fetch checklist completion summary
    const checklistSummaries = await db.all(`
      SELECT task_id, 
             COUNT(*) as total_items, 
             SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_items
      FROM checklists
      WHERE task_id IN (
        SELECT t.id FROM tasks t 
        JOIN lists l ON t.list_id = l.id 
        WHERE l.project_id = ?
      )
      GROUP BY task_id
    `, [projectId]);

    // Map checklists to tasks
    const checklistMap = {};
    checklistSummaries.forEach(item => {
      checklistMap[item.task_id] = {
        total: item.total_items,
        completed: item.completed_items
      };
    });

    // Embed checklist progress and comments count on tasks
    const commentCounts = await db.all(`
      SELECT task_id, COUNT(*) as comment_count
      FROM comments
      WHERE task_id IN (
        SELECT t.id FROM tasks t 
        JOIN lists l ON t.list_id = l.id 
        WHERE l.project_id = ?
      )
      GROUP BY task_id
    `, [projectId]);

    const commentsMap = {};
    commentCounts.forEach(item => {
      commentsMap[item.task_id] = item.comment_count;
    });

    const tasksWithMetadata = tasks.map(task => ({
      ...task,
      checklist_summary: checklistMap[task.id] || { total: 0, completed: 0 },
      comment_count: commentsMap[task.id] || 0
    }));

    // Group tasks by list_id
    const listsWithTasks = lists.map(list => {
      return {
        ...list,
        tasks: tasksWithMetadata.filter(t => t.list_id === list.id)
      };
    });

    res.json({
      project,
      members,
      lists: listsWithTasks
    });
  } catch (error) {
    console.error('Fetch project details error:', error);
    res.status(500).json({ error: 'Server error fetching project details' });
  }
});

// Add member to project by email
router.post('/projects/:id/members', authMiddleware, async (req, res) => {
  const projectId = req.params.id;
  const { email } = req.body;
  const io = req.app.get('io');

  if (!email) {
    return res.status(400).json({ error: 'User email is required' });
  }

  try {
    const isOwnerOrMember = await checkMember(projectId, req.user.id);
    if (!isOwnerOrMember) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();
    
    // Find project details
    const project = await db.get('SELECT name FROM projects WHERE id = ?', [projectId]);

    // Find user by email
    const userToInvite = await db.get('SELECT id, username, email FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!userToInvite) {
      return res.status(404).json({ error: 'No user registered with this email' });
    }

    // Check if already member
    const existingMember = await db.get(
      'SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, userToInvite.id]
    );

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    // Insert member
    await db.run(
      'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
      [projectId, userToInvite.id]
    );

    // Log Activity
    await logActivity(projectId, null, req.user.id, `added ${userToInvite.username} to the project`);

    // Notify user
    await sendNotification(
      io,
      userToInvite.id,
      'Project Invitation',
      `${req.user.username} added you to the project "${project.name}"`,
      'project_invite'
    );

    // Broadcast update to other users on board
    if (io) {
      io.to(`project:${projectId}`).emit('board-updated', { type: 'member-added' });
    }

    res.json({ success: true, member: userToInvite });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Server error inviting member' });
  }
});

// --- LISTS ---

// Add a column/list to project
router.post('/projects/:id/lists', authMiddleware, async (req, res) => {
  const projectId = req.params.id;
  const { name } = req.body;
  const io = req.app.get('io');

  if (!name) {
    return res.status(400).json({ error: 'List name is required' });
  }

  try {
    const isJoined = await checkMember(projectId, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    const db = getDb();

    // Get max position
    const posRow = await db.get('SELECT MAX(position) as maxPos FROM lists WHERE project_id = ?', [projectId]);
    const position = posRow.maxPos !== null ? posRow.maxPos + 1 : 0;

    const result = await db.run(
      'INSERT INTO lists (project_id, name, position) VALUES (?, ?, ?)',
      [projectId, name, position]
    );

    await logActivity(projectId, null, req.user.id, `created list "${name}"`);

    if (io) {
      io.to(`project:${projectId}`).emit('board-updated', { type: 'list-created' });
    }

    const newList = {
      id: result.lastID,
      project_id: projectId,
      name,
      position,
      tasks: []
    };

    res.status(201).json(newList);
  } catch (error) {
    console.error('Create list error:', error);
    res.status(500).json({ error: 'Server error creating list' });
  }
});

// Rename or reorder list
router.put('/lists/:id', authMiddleware, async (req, res) => {
  const listId = req.params.id;
  const { name, position } = req.body;
  const io = req.app.get('io');

  try {
    const db = getDb();
    
    // Find list
    const list = await db.get('SELECT project_id, name, position FROM lists WHERE id = ?', [listId]);
    if (!list) return res.status(404).json({ error: 'List not found' });

    const isJoined = await checkMember(list.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    if (name !== undefined) {
      await db.run('UPDATE lists SET name = ? WHERE id = ?', [name, listId]);
      await logActivity(list.project_id, null, req.user.id, `renamed list "${list.name}" to "${name}"`);
    }

    if (position !== undefined) {
      // Reordering logic
      await db.run('UPDATE lists SET position = ? WHERE id = ?', [position, listId]);
    }

    if (io) {
      io.to(`project:${list.project_id}`).emit('board-updated', { type: 'list-updated' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update list error:', error);
    res.status(500).json({ error: 'Server error updating list' });
  }
});

// Delete list
router.delete('/lists/:id', authMiddleware, async (req, res) => {
  const listId = req.params.id;
  const io = req.app.get('io');

  try {
    const db = getDb();
    const list = await db.get('SELECT project_id, name FROM lists WHERE id = ?', [listId]);
    if (!list) return res.status(404).json({ error: 'List not found' });

    const isJoined = await checkMember(list.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    // Delete list
    await db.run('DELETE FROM lists WHERE id = ?', [listId]);

    await logActivity(list.project_id, null, req.user.id, `deleted list "${list.name}"`);

    if (io) {
      io.to(`project:${list.project_id}`).emit('board-updated', { type: 'list-deleted' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete list error:', error);
    res.status(500).json({ error: 'Server error deleting list' });
  }
});

// --- TASKS ---

// Add task to a list
router.post('/lists/:listId/tasks', authMiddleware, async (req, res) => {
  const listId = req.params.listId;
  const { title, description, priority, due_date, assignee_id } = req.body;
  const io = req.app.get('io');

  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  try {
    const db = getDb();
    
    // Find list & project
    const list = await db.get('SELECT project_id, name FROM lists WHERE id = ?', [listId]);
    if (!list) return res.status(404).json({ error: 'List not found' });

    const isJoined = await checkMember(list.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    // Get max task position in list
    const posRow = await db.get('SELECT MAX(position) as maxPos FROM tasks WHERE list_id = ?', [listId]);
    const position = posRow.maxPos !== null ? posRow.maxPos + 1 : 0;

    const result = await db.run(`
      INSERT INTO tasks (list_id, title, description, position, priority, due_date, assignee_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      listId,
      title,
      description || '',
      position,
      priority || 'medium',
      due_date || null,
      assignee_id || null
    ]);

    const taskId = result.lastID;
    
    await logActivity(list.project_id, taskId, req.user.id, `created task "${title}" in list "${list.name}"`);

    // If assignee provided, create notification
    if (assignee_id) {
      const projectDetails = await db.get('SELECT name FROM projects WHERE id = ?', [list.project_id]);
      await sendNotification(
        io,
        assignee_id,
        'New Task Assigned',
        `${req.user.username} assigned you task "${title}" in "${projectDetails.name}"`,
        'assignment'
      );
    }

    if (io) {
      io.to(`project:${list.project_id}`).emit('board-updated', { type: 'task-created' });
    }

    const newTask = {
      id: taskId,
      list_id: parseInt(listId),
      title,
      description: description || '',
      position,
      priority: priority || 'medium',
      due_date: due_date || null,
      assignee_id: assignee_id ? parseInt(assignee_id) : null,
      comment_count: 0,
      checklist_summary: { total: 0, completed: 0 }
    };

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error creating task' });
  }
});

// Update task details or position (drag-and-drop)
router.put('/tasks/:id', authMiddleware, async (req, res) => {
  const taskId = req.params.id;
  const { title, description, priority, due_date, assignee_id, list_id, position } = req.body;
  const io = req.app.get('io');

  try {
    const db = getDb();
    
    // Find task and associated project
    const task = await db.get(`
      SELECT t.*, l.project_id, l.name as list_name 
      FROM tasks t 
      JOIN lists l ON t.list_id = l.id 
      WHERE t.id = ?
    `, [taskId]);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isJoined = await checkMember(task.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    const projectDetails = await db.get('SELECT name FROM projects WHERE id = ?', [task.project_id]);

    let listChanged = false;
    let dragDropMove = false;

    // Handle reordering / Drag & Drop moves
    if (list_id !== undefined && position !== undefined) {
      dragDropMove = true;
      const targetListId = parseInt(list_id);
      const targetPosition = parseInt(position);

      if (targetListId !== task.list_id) {
        listChanged = true;
        const targetList = await db.get('SELECT name FROM lists WHERE id = ?', [targetListId]);
        
        // Reorder tasks in destination list to make room
        await db.run(
          'UPDATE tasks SET position = position + 1 WHERE list_id = ? AND position >= ?',
          [targetListId, targetPosition]
        );

        // Update target task list and position
        await db.run(
          'UPDATE tasks SET list_id = ?, position = ? WHERE id = ?',
          [targetListId, targetPosition, taskId]
        );

        // Log move
        await logActivity(
          task.project_id,
          taskId,
          req.user.id,
          `moved task "${task.title}" from "${task.list_name}" to "${targetList.name}"`
        );
      } else {
        // Same list reordering
        if (targetPosition > task.position) {
          // Moved down: shift items between old and new position up
          await db.run(
            'UPDATE tasks SET position = position - 1 WHERE list_id = ? AND position > ? AND position <= ?',
            [task.list_id, task.position, targetPosition]
          );
        } else if (targetPosition < task.position) {
          // Moved up: shift items between new and old position down
          await db.run(
            'UPDATE tasks SET position = position + 1 WHERE list_id = ? AND position >= ? AND position < ?',
            [task.list_id, targetPosition, task.position]
          );
        }
        await db.run('UPDATE tasks SET position = ? WHERE id = ?', [targetPosition, taskId]);
      }
    }

    // Handle normal text field modifications
    if (!dragDropMove) {
      if (title !== undefined && title !== task.title) {
        await db.run('UPDATE tasks SET title = ? WHERE id = ?', [title, taskId]);
        await logActivity(task.project_id, taskId, req.user.id, `renamed task to "${title}"`);
      }
      
      if (description !== undefined && description !== task.description) {
        await db.run('UPDATE tasks SET description = ? WHERE id = ?', [description, taskId]);
        await logActivity(task.project_id, taskId, req.user.id, `updated description of "${title || task.title}"`);
      }

      if (priority !== undefined && priority !== task.priority) {
        await db.run('UPDATE tasks SET priority = ? WHERE id = ?', [priority, taskId]);
        await logActivity(task.project_id, taskId, req.user.id, `set priority of "${title || task.title}" to ${priority.toUpperCase()}`);
      }

      if (due_date !== undefined && due_date !== task.due_date) {
        await db.run('UPDATE tasks SET due_date = ? WHERE id = ?', [due_date, taskId]);
        const dateStr = due_date ? new Date(due_date).toLocaleDateString() : 'no due date';
        await logActivity(task.project_id, taskId, req.user.id, `set due date of "${title || task.title}" to ${dateStr}`);
      }

      if (assignee_id !== undefined && parseInt(assignee_id) !== task.assignee_id) {
        const newAssigneeId = assignee_id ? parseInt(assignee_id) : null;
        await db.run('UPDATE tasks SET assignee_id = ? WHERE id = ?', [newAssigneeId, taskId]);
        
        if (newAssigneeId) {
          const newAssignee = await db.get('SELECT username FROM users WHERE id = ?', [newAssigneeId]);
          await logActivity(task.project_id, taskId, req.user.id, `assigned "${title || task.title}" to ${newAssignee.username}`);
          
          // Notify assignee
          await sendNotification(
            io,
            newAssigneeId,
            'Task Assigned',
            `${req.user.username} assigned you task "${title || task.title}" in "${projectDetails.name}"`,
            'assignment'
          );
        } else {
          await logActivity(task.project_id, taskId, req.user.id, `unassigned task "${title || task.title}"`);
        }
      }
    }

    if (io) {
      // Broadcast update to the board
      io.to(`project:${task.project_id}`).emit('board-updated', { type: 'task-updated', taskId });
      io.to(`project:${task.project_id}`).emit('task-updated', { taskId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Server error updating task' });
  }
});

// Delete a task
router.delete('/tasks/:id', authMiddleware, async (req, res) => {
  const taskId = req.params.id;
  const io = req.app.get('io');

  try {
    const db = getDb();
    
    const task = await db.get(`
      SELECT t.title, l.project_id 
      FROM tasks t 
      JOIN lists l ON t.list_id = l.id 
      WHERE t.id = ?
    `, [taskId]);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isJoined = await checkMember(task.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    await db.run('DELETE FROM tasks WHERE id = ?', [taskId]);

    await logActivity(task.project_id, null, req.user.id, `deleted task "${task.title}"`);

    if (io) {
      io.to(`project:${task.project_id}`).emit('board-updated', { type: 'task-deleted' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error deleting task' });
  }
});

// Get task details (for card modal overlay, includes comments + checklist + logs)
router.get('/tasks/:id/details', authMiddleware, async (req, res) => {
  const taskId = req.params.id;
  try {
    const db = getDb();
    const task = await db.get(`
      SELECT t.*, l.project_id, l.name as list_name, u.username as assignee_name, u.email as assignee_email
      FROM tasks t
      JOIN lists l ON t.list_id = l.id
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.id = ?
    `, [taskId]);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isJoined = await checkMember(task.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    // Fetch checklist
    const checklist = await db.all('SELECT * FROM checklists WHERE task_id = ? ORDER BY id ASC', [taskId]);

    // Fetch comments
    const comments = await db.all(`
      SELECT c.*, u.username, u.email
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at DESC
    `, [taskId]);

    // Fetch activities
    const activities = await db.all(`
      SELECT a.*, u.username 
      FROM activities a 
      JOIN users u ON a.user_id = u.id 
      WHERE a.task_id = ? 
      ORDER BY a.created_at DESC LIMIT 30
    `, [taskId]);

    res.json({
      task,
      checklist,
      comments,
      activities
    });
  } catch (error) {
    console.error('Get task details error:', error);
    res.status(500).json({ error: 'Server error fetching task details' });
  }
});

// --- COMMENTS ---

// Add a comment to a task
router.post('/tasks/:taskId/comments', authMiddleware, async (req, res) => {
  const taskId = req.params.taskId;
  const { content } = req.body;
  const io = req.app.get('io');

  if (!content) return res.status(400).json({ error: 'Comment content is required' });

  try {
    const db = getDb();
    
    // Find task and associated project
    const task = await db.get(`
      SELECT t.title, l.project_id 
      FROM tasks t 
      JOIN lists l ON t.list_id = l.id 
      WHERE t.id = ?
    `, [taskId]);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isJoined = await checkMember(task.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    const result = await db.run(
      'INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)',
      [taskId, req.user.id, content]
    );

    const commentId = result.lastID;

    await logActivity(task.project_id, taskId, req.user.id, `commented: "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`);

    const newComment = {
      id: commentId,
      task_id: parseInt(taskId),
      user_id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      content,
      created_at: new Date().toISOString()
    };

    if (io) {
      io.to(`project:${task.project_id}`).emit('comment-added', { taskId, comment: newComment });
      io.to(`project:${task.project_id}`).emit('board-updated', { type: 'comment-added', taskId });
    }

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Server error adding comment' });
  }
});

// --- CHECKLISTS ---

// Add checklist item to a task
router.post('/tasks/:taskId/checklists', authMiddleware, async (req, res) => {
  const taskId = req.params.taskId;
  const { title } = req.body;
  const io = req.app.get('io');

  if (!title) return res.status(400).json({ error: 'Checklist item title is required' });

  try {
    const db = getDb();
    const task = await db.get(`
      SELECT t.title, l.project_id 
      FROM tasks t 
      JOIN lists l ON t.list_id = l.id 
      WHERE t.id = ?
    `, [taskId]);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isJoined = await checkMember(task.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    const result = await db.run(
      'INSERT INTO checklists (task_id, title, is_completed) VALUES (?, ?, 0)',
      [taskId, title]
    );

    const newItem = {
      id: result.lastID,
      task_id: parseInt(taskId),
      title,
      is_completed: 0
    };

    await logActivity(task.project_id, taskId, req.user.id, `added checklist item "${title}"`);

    if (io) {
      io.to(`project:${task.project_id}`).emit('task-updated', { taskId });
      io.to(`project:${task.project_id}`).emit('board-updated', { type: 'checklist-added', taskId });
    }

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Add checklist error:', error);
    res.status(500).json({ error: 'Server error adding checklist item' });
  }
});

// Toggle or edit checklist item
router.put('/checklists/:id', authMiddleware, async (req, res) => {
  const itemId = req.params.id;
  const { title, is_completed } = req.body;
  const io = req.app.get('io');

  try {
    const db = getDb();
    
    // Find checklist item and project
    const item = await db.get(`
      SELECT c.*, t.title as task_title, l.project_id 
      FROM checklists c
      JOIN tasks t ON c.task_id = t.id
      JOIN lists l ON t.list_id = l.id
      WHERE c.id = ?
    `, [itemId]);

    if (!item) return res.status(404).json({ error: 'Checklist item not found' });

    const isJoined = await checkMember(item.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    if (title !== undefined) {
      await db.run('UPDATE checklists SET title = ? WHERE id = ?', [title, itemId]);
    }

    if (is_completed !== undefined) {
      const completedVal = is_completed ? 1 : 0;
      await db.run('UPDATE checklists SET is_completed = ? WHERE id = ?', [completedVal, itemId]);
      const statusText = is_completed ? 'completed' : 'uncompleted';
      await logActivity(item.project_id, item.task_id, req.user.id, `${statusText} checklist item "${item.title}"`);
    }

    if (io) {
      io.to(`project:${item.project_id}`).emit('task-updated', { taskId: item.task_id });
      io.to(`project:${item.project_id}`).emit('board-updated', { type: 'checklist-updated', taskId: item.task_id });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update checklist error:', error);
    res.status(500).json({ error: 'Server error updating checklist item' });
  }
});

// Delete checklist item
router.delete('/checklists/:id', authMiddleware, async (req, res) => {
  const itemId = req.params.id;
  const io = req.app.get('io');

  try {
    const db = getDb();
    
    const item = await db.get(`
      SELECT c.*, l.project_id 
      FROM checklists c
      JOIN tasks t ON c.task_id = t.id
      JOIN lists l ON t.list_id = l.id
      WHERE c.id = ?
    `, [itemId]);

    if (!item) return res.status(404).json({ error: 'Checklist item not found' });

    const isJoined = await checkMember(item.project_id, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    await db.run('DELETE FROM checklists WHERE id = ?', [itemId]);
    await logActivity(item.project_id, item.task_id, req.user.id, `removed checklist item "${item.title}"`);

    if (io) {
      io.to(`project:${item.project_id}`).emit('task-updated', { taskId: item.task_id });
      io.to(`project:${item.project_id}`).emit('board-updated', { type: 'checklist-deleted', taskId: item.task_id });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete checklist item error:', error);
    res.status(500).json({ error: 'Server error deleting checklist item' });
  }
});

// --- NOTIFICATIONS ---

// Get all notifications for current user
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const notifications = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(notifications);
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ error: 'Server error fetching notifications' });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    await db.run(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Read notification error:', error);
    res.status(500).json({ error: 'Server error updating notification' });
  }
});

// Mark all as read
router.put('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    await db.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Read all notifications error:', error);
    res.status(500).json({ error: 'Server error updating notifications' });
  }
});

// --- GENERAL & USERS ---

// Search users by email or username (except self) to add as members
router.get('/users/search', authMiddleware, async (req, res) => {
  const query = req.query.q;
  if (!query || query.length < 2) {
    return res.json([]);
  }

  try {
    const db = getDb();
    const likeQuery = `%${query.toLowerCase()}%`;
    
    // Search username or email
    const users = await db.all(
      'SELECT id, username, email FROM users WHERE (LOWER(username) LIKE ? OR LOWER(email) LIKE ?) AND id != ? LIMIT 8',
      [likeQuery, likeQuery, req.user.id]
    );
    
    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Server error searching users' });
  }
});

// Get project activity feed
router.get('/projects/:id/activities', authMiddleware, async (req, res) => {
  const projectId = req.params.id;
  try {
    const isJoined = await checkMember(projectId, req.user.id);
    if (!isJoined) return res.status(403).json({ error: 'Access denied' });

    const db = getDb();
    const activities = await db.all(`
      SELECT a.*, u.username, t.title as task_title
      FROM activities a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN tasks t ON a.task_id = t.id
      WHERE a.project_id = ?
      ORDER BY a.created_at DESC
      LIMIT 40
    `, [projectId]);

    res.json(activities);
  } catch (error) {
    console.error('Fetch project activities error:', error);
    res.status(500).json({ error: 'Server error fetching activities' });
  }
});

export default router;
