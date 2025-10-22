const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/db');

/**
 * GET /api/transactions/:userId
 * Get all transactions for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, type } = req.query;

    let queryText = `
      SELECT * FROM transactions
      WHERE user_id = $1
    `;
    const params = [userId];

    if (type) {
      queryText += ` AND type = $2`;
      params.push(type);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);

    const transactions = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      amount: parseFloat(row.amount),
      description: row.description,
      transactionHash: row.transaction_hash,
      status: row.status,
      createdAt: row.created_at,
    }));

    res.json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions', message: error.message });
  }
});

/**
 * GET /api/transactions/:userId/recent
 * Get recent transactions (last 10)
 */
router.get('/:userId/recent', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT * FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    const transactions = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      amount: parseFloat(row.amount),
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
    }));

    res.json(transactions);
  } catch (error) {
    console.error('Get recent transactions error:', error);
    res.status(500).json({ error: 'Failed to get recent transactions', message: error.message });
  }
});

/**
 * POST /api/transactions/:userId/withdrawal
 * Create a withdrawal transaction
 */
router.post('/:userId/withdrawal', async (req, res) => {
  const client = await getClient();

  try {
    const { userId } = req.params;
    const { amount, description, transactionHash, withdrawalAddress } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    await client.query('BEGIN');

    // Check user balance
    const userResult = await client.query(
      'SELECT total_balance FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const currentBalance = parseFloat(userResult.rows[0].total_balance);

    if (currentBalance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create withdrawal transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, transaction_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        'withdrawal',
        amount,
        description || `Withdrawal to ${withdrawalAddress || 'external wallet'}`,
        transactionHash || null,
        'confirmed',
      ]
    );

    const transaction = transactionResult.rows[0];

    // Update user balance
    await client.query(
      'UPDATE users SET total_balance = total_balance - $1 WHERE id = $2',
      [amount, userId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      id: transaction.id,
      userId: transaction.user_id,
      type: transaction.type,
      amount: parseFloat(transaction.amount),
      description: transaction.description,
      status: transaction.status,
      createdAt: transaction.created_at,
      message: 'Withdrawal successful',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create withdrawal error:', error);
    res.status(500).json({ error: 'Failed to create withdrawal', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/transactions/:userId/earnings
 * Record earnings from yield/interest
 */
router.post('/:userId/earnings', async (req, res) => {
  const client = await getClient();

  try {
    const { userId } = req.params;
    const { amount, description } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid earnings amount' });
    }

    await client.query('BEGIN');

    // Create earnings transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, 'earnings', amount, description || 'Daily yield earnings', 'confirmed']
    );

    const transaction = transactionResult.rows[0];

    // Update user balance and earnings
    await client.query(
      `UPDATE users
       SET total_balance = total_balance + $1,
           total_earnings = total_earnings + $1
       WHERE id = $2`,
      [amount, userId]
    );

    // Update today's growth data
    const today = new Date().toISOString().split('T')[0];
    await client.query(
      `INSERT INTO daily_growth (user_id, date, earnings, growth_percentage)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         earnings = daily_growth.earnings + EXCLUDED.earnings,
         growth_percentage = EXCLUDED.growth_percentage`,
      [userId, today, amount, (amount / 1000) * 100] // Simplified growth calculation
    );

    await client.query('COMMIT');

    res.status(201).json({
      id: transaction.id,
      userId: transaction.user_id,
      type: transaction.type,
      amount: parseFloat(transaction.amount),
      description: transaction.description,
      status: transaction.status,
      createdAt: transaction.created_at,
      message: 'Earnings recorded successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Record earnings error:', error);
    res.status(500).json({ error: 'Failed to record earnings', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/transactions/:transactionId/status
 * Update transaction status
 */
router.put('/:transactionId/status', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'confirmed', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      'UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *',
      [status, transactionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({
      id: result.rows[0].id,
      status: result.rows[0].status,
      message: 'Transaction status updated',
    });
  } catch (error) {
    console.error('Update transaction status error:', error);
    res.status(500).json({ error: 'Failed to update transaction status', message: error.message });
  }
});

module.exports = router;
