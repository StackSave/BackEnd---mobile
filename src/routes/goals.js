const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

/**
 * GET /api/goals/:userId
 * Get all goals for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT * FROM savings_goals
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const goals = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      targetAmount: parseFloat(row.target_amount),
      currentAmount: parseFloat(row.current_amount),
      frequency: row.frequency,
      startDate: row.start_date,
      endDate: row.end_date,
      isMainGoal: row.is_main_goal,
      isCompleted: row.is_completed,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(goals);
  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({ error: 'Failed to get goals', message: error.message });
  }
});

/**
 * GET /api/goals/:userId/main
 * Get main goal for a user
 */
router.get('/:userId/main', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT * FROM savings_goals
       WHERE user_id = $1 AND is_main_goal = true
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No main goal found' });
    }

    const row = result.rows[0];
    const goal = {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      targetAmount: parseFloat(row.target_amount),
      currentAmount: parseFloat(row.current_amount),
      frequency: row.frequency,
      startDate: row.start_date,
      endDate: row.end_date,
      isMainGoal: row.is_main_goal,
      isCompleted: row.is_completed,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    res.json(goal);
  } catch (error) {
    console.error('Get main goal error:', error);
    res.status(500).json({ error: 'Failed to get main goal', message: error.message });
  }
});

/**
 * POST /api/goals/:userId
 * Create a new goal
 */
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, targetAmount, frequency, startDate, endDate, isMainGoal } = req.body;

    // Validation
    if (!title || !targetAmount || !frequency || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'Frequency must be "weekly" or "monthly"' });
    }

    // If this is being set as main goal, unset any existing main goal
    if (isMainGoal) {
      await query(
        'UPDATE savings_goals SET is_main_goal = false WHERE user_id = $1',
        [userId]
      );
    }

    const result = await query(
      `INSERT INTO savings_goals (user_id, title, target_amount, current_amount, frequency, start_date, end_date, is_main_goal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, title, targetAmount, 0, frequency, startDate, endDate, isMainGoal || false]
    );

    const row = result.rows[0];
    const goal = {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      targetAmount: parseFloat(row.target_amount),
      currentAmount: parseFloat(row.current_amount),
      frequency: row.frequency,
      startDate: row.start_date,
      endDate: row.end_date,
      isMainGoal: row.is_main_goal,
      isCompleted: row.is_completed,
      createdAt: row.created_at,
    };

    res.status(201).json(goal);
  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({ error: 'Failed to create goal', message: error.message });
  }
});

/**
 * PUT /api/goals/:goalId
 * Update a goal
 */
router.put('/:goalId', async (req, res) => {
  try {
    const { goalId } = req.params;
    const { title, targetAmount, currentAmount, frequency, endDate, isMainGoal, isCompleted } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (targetAmount !== undefined) {
      updates.push(`target_amount = $${paramIndex++}`);
      values.push(targetAmount);
    }
    if (currentAmount !== undefined) {
      updates.push(`current_amount = $${paramIndex++}`);
      values.push(currentAmount);
    }
    if (frequency !== undefined) {
      updates.push(`frequency = $${paramIndex++}`);
      values.push(frequency);
    }
    if (endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(endDate);
    }
    if (isMainGoal !== undefined) {
      updates.push(`is_main_goal = $${paramIndex++}`);
      values.push(isMainGoal);

      // If setting as main goal, unset other main goals
      if (isMainGoal) {
        const goalResult = await query('SELECT user_id FROM savings_goals WHERE id = $1', [goalId]);
        if (goalResult.rows.length > 0) {
          await query(
            'UPDATE savings_goals SET is_main_goal = false WHERE user_id = $1 AND id != $2',
            [goalResult.rows[0].user_id, goalId]
          );
        }
      }
    }
    if (isCompleted !== undefined) {
      updates.push(`is_completed = $${paramIndex++}`);
      values.push(isCompleted);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(goalId);

    const result = await query(
      `UPDATE savings_goals SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const row = result.rows[0];
    const goal = {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      targetAmount: parseFloat(row.target_amount),
      currentAmount: parseFloat(row.current_amount),
      frequency: row.frequency,
      startDate: row.start_date,
      endDate: row.end_date,
      isMainGoal: row.is_main_goal,
      isCompleted: row.is_completed,
      updatedAt: row.updated_at,
    };

    res.json(goal);
  } catch (error) {
    console.error('Update goal error:', error);
    res.status(500).json({ error: 'Failed to update goal', message: error.message });
  }
});

/**
 * DELETE /api/goals/:goalId
 * Delete a goal
 */
router.delete('/:goalId', async (req, res) => {
  try {
    const { goalId } = req.params;

    const result = await query(
      'DELETE FROM savings_goals WHERE id = $1 RETURNING *',
      [goalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    console.error('Delete goal error:', error);
    res.status(500).json({ error: 'Failed to delete goal', message: error.message });
  }
});

module.exports = router;
