const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

/**
 * GET /api/streaks/:userId
 * Get streak information for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      'SELECT * FROM streaks WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create streak record if it doesn't exist
      const createResult = await query(
        `INSERT INTO streaks (user_id, current_streak, longest_streak, total_deposits)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, 0, 0, 0]
      );

      const streak = createResult.rows[0];
      return res.json({
        userId: streak.user_id,
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        lastDepositDate: streak.last_deposit_date,
        totalDeposits: streak.total_deposits,
      });
    }

    const streak = result.rows[0];

    // Check if streak should be reset (missed a day)
    if (streak.last_deposit_date) {
      const today = new Date();
      const lastDeposit = new Date(streak.last_deposit_date);
      const daysSinceLastDeposit = Math.floor(
        (today.setHours(0, 0, 0, 0) - lastDeposit.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
      );

      // Reset streak if more than 1 day has passed
      if (daysSinceLastDeposit > 1 && streak.current_streak > 0) {
        await query(
          'UPDATE streaks SET current_streak = 0 WHERE user_id = $1',
          [userId]
        );
        streak.current_streak = 0;
      }
    }

    res.json({
      userId: streak.user_id,
      currentStreak: streak.current_streak,
      longestStreak: streak.longest_streak,
      lastDepositDate: streak.last_deposit_date,
      totalDeposits: streak.total_deposits,
      createdAt: streak.created_at,
      updatedAt: streak.updated_at,
    });
  } catch (error) {
    console.error('Get streak error:', error);
    res.status(500).json({ error: 'Failed to get streak', message: error.message });
  }
});

/**
 * POST /api/streaks/:userId/check
 * Check and update streak after a deposit
 * Note: This is typically called automatically by the deposit endpoint,
 * but can be used for manual streak updates
 */
router.post('/:userId/check', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      'SELECT * FROM streaks WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Streak record not found' });
    }

    const streak = result.rows[0];
    const today = new Date().toISOString().split('T')[0];
    const lastDepositDate = streak.last_deposit_date
      ? new Date(streak.last_deposit_date).toISOString().split('T')[0]
      : null;

    // Don't update if already deposited today
    if (lastDepositDate === today) {
      return res.json({
        message: 'Streak already updated for today',
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
      });
    }

    let newStreak = streak.current_streak;

    if (lastDepositDate) {
      const daysDiff = Math.floor(
        (new Date(today) - new Date(lastDepositDate)) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === 1) {
        newStreak += 1;
      } else if (daysDiff > 1) {
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    const longestStreak = Math.max(newStreak, streak.longest_streak);

    const updateResult = await query(
      `UPDATE streaks
       SET current_streak = $1, longest_streak = $2, last_deposit_date = $3, total_deposits = total_deposits + 1
       WHERE user_id = $4
       RETURNING *`,
      [newStreak, longestStreak, today, userId]
    );

    const updatedStreak = updateResult.rows[0];

    res.json({
      message: 'Streak updated successfully',
      currentStreak: updatedStreak.current_streak,
      longestStreak: updatedStreak.longest_streak,
      lastDepositDate: updatedStreak.last_deposit_date,
      totalDeposits: updatedStreak.total_deposits,
    });
  } catch (error) {
    console.error('Check streak error:', error);
    res.status(500).json({ error: 'Failed to check streak', message: error.message });
  }
});

/**
 * POST /api/streaks/:userId/reset
 * Reset current streak (for testing or manual reset)
 */
router.post('/:userId/reset', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      'UPDATE streaks SET current_streak = 0 WHERE user_id = $1 RETURNING *',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Streak record not found' });
    }

    res.json({
      message: 'Streak reset successfully',
      currentStreak: 0,
    });
  } catch (error) {
    console.error('Reset streak error:', error);
    res.status(500).json({ error: 'Failed to reset streak', message: error.message });
  }
});

module.exports = router;
