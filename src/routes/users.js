const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

/**
 * GET /api/users/:userId
 * Get user profile information
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      walletAddress: user.wallet_address,
      email: user.email,
      mode: user.mode,
      totalBalance: parseFloat(user.total_balance),
      totalEarnings: parseFloat(user.total_earnings),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user', message: error.message });
  }
});

/**
 * PUT /api/users/:userId/mode
 * Update user mode (lite/pro)
 */
router.put('/:userId/mode', async (req, res) => {
  try {
    const { userId } = req.params;
    const { mode } = req.body;

    if (!mode || !['lite', 'pro'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be "lite" or "pro"' });
    }

    const result = await query(
      'UPDATE users SET mode = $1 WHERE id = $2 RETURNING *',
      [mode, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      message: 'Mode updated successfully',
      mode: user.mode,
    });
  } catch (error) {
    console.error('Update mode error:', error);
    res.status(500).json({ error: 'Failed to update mode', message: error.message });
  }
});

/**
 * PUT /api/users/:userId/balance
 * Update user balance (called after deposits/withdrawals)
 */
router.put('/:userId/balance', async (req, res) => {
  try {
    const { userId } = req.params;
    const { totalBalance, totalEarnings } = req.body;

    if (totalBalance === undefined) {
      return res.status(400).json({ error: 'Total balance is required' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    updates.push(`total_balance = $${paramIndex++}`);
    values.push(totalBalance);

    if (totalEarnings !== undefined) {
      updates.push(`total_earnings = $${paramIndex++}`);
      values.push(totalEarnings);
    }

    values.push(userId);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      message: 'Balance updated successfully',
      totalBalance: parseFloat(user.total_balance),
      totalEarnings: parseFloat(user.total_earnings),
    });
  } catch (error) {
    console.error('Update balance error:', error);
    res.status(500).json({ error: 'Failed to update balance', message: error.message });
  }
});

/**
 * GET /api/users/:userId/growth
 * Get user's daily growth data
 */
router.get('/:userId/growth', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 30 } = req.query;

    const result = await query(
      `SELECT * FROM daily_growth
       WHERE user_id = $1
       ORDER BY date DESC
       LIMIT $2`,
      [userId, limit]
    );

    const growthData = result.rows.map(row => ({
      date: row.date,
      growthPercentage: parseFloat(row.growth_percentage),
      earnings: parseFloat(row.earnings),
      hasDeposit: row.has_deposit,
    }));

    res.json(growthData.reverse()); // Return oldest to newest
  } catch (error) {
    console.error('Get growth data error:', error);
    res.status(500).json({ error: 'Failed to get growth data', message: error.message });
  }
});

/**
 * POST /api/users/:userId/growth
 * Add daily growth data entry
 */
router.post('/:userId/growth', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, growthPercentage, earnings, hasDeposit } = req.body;

    const result = await query(
      `INSERT INTO daily_growth (user_id, date, growth_percentage, earnings, has_deposit)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         growth_percentage = EXCLUDED.growth_percentage,
         earnings = EXCLUDED.earnings,
         has_deposit = EXCLUDED.has_deposit
       RETURNING *`,
      [userId, date || new Date().toISOString().split('T')[0], growthPercentage || 0, earnings || 0, hasDeposit || false]
    );

    const growth = result.rows[0];

    res.json({
      date: growth.date,
      growthPercentage: parseFloat(growth.growth_percentage),
      earnings: parseFloat(growth.earnings),
      hasDeposit: growth.has_deposit,
    });
  } catch (error) {
    console.error('Add growth data error:', error);
    res.status(500).json({ error: 'Failed to add growth data', message: error.message });
  }
});

module.exports = router;
