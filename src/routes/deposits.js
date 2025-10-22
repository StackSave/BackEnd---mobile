const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/db');

/**
 * GET /api/deposits/:userId
 * Get all deposits for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, goalId } = req.query;

    let queryText = `
      SELECT d.*, g.title as goal_title, pm.type as payment_method_type
      FROM deposits d
      LEFT JOIN savings_goals g ON d.goal_id = g.id
      LEFT JOIN payment_methods pm ON d.payment_method_id = pm.id
      WHERE d.user_id = $1
    `;
    const params = [userId];

    if (goalId) {
      queryText += ` AND d.goal_id = $2`;
      params.push(goalId);
    }

    queryText += ` ORDER BY d.deposit_date DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);

    const deposits = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      goalId: row.goal_id,
      goalTitle: row.goal_title,
      amount: parseFloat(row.amount),
      depositDate: row.deposit_date,
      paymentMethodId: row.payment_method_id,
      paymentMethodType: row.payment_method_type,
      transactionHash: row.transaction_hash,
      status: row.status,
      createdAt: row.created_at,
    }));

    res.json(deposits);
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ error: 'Failed to get deposits', message: error.message });
  }
});

/**
 * POST /api/deposits/:userId
 * Create a new deposit
 */
router.post('/:userId', async (req, res) => {
  const client = await getClient();

  try {
    const { userId } = req.params;
    const { goalId, amount, paymentMethodId, transactionHash } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount' });
    }

    await client.query('BEGIN');

    // Create deposit record
    const depositResult = await client.query(
      `INSERT INTO deposits (user_id, goal_id, amount, payment_method_id, transaction_hash, status, deposit_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, goalId || null, amount, paymentMethodId || null, transactionHash || null, 'confirmed', new Date()]
    );

    const deposit = depositResult.rows[0];

    // Update goal current amount if goalId provided
    if (goalId) {
      await client.query(
        `UPDATE savings_goals
         SET current_amount = current_amount + $1
         WHERE id = $2`,
        [amount, goalId]
      );

      // Check if goal is completed
      const goalCheck = await client.query(
        'SELECT current_amount, target_amount FROM savings_goals WHERE id = $1',
        [goalId]
      );

      if (goalCheck.rows.length > 0) {
        const { current_amount, target_amount } = goalCheck.rows[0];
        if (parseFloat(current_amount) >= parseFloat(target_amount)) {
          await client.query(
            'UPDATE savings_goals SET is_completed = true WHERE id = $1',
            [goalId]
          );
        }
      }
    }

    // Update user total balance
    await client.query(
      `UPDATE users
       SET total_balance = total_balance + $1
       WHERE id = $2`,
      [amount, userId]
    );

    // Update streak
    const today = new Date().toISOString().split('T')[0];
    const streakResult = await client.query(
      'SELECT * FROM streaks WHERE user_id = $1',
      [userId]
    );

    if (streakResult.rows.length > 0) {
      const streak = streakResult.rows[0];
      const lastDepositDate = streak.last_deposit_date
        ? new Date(streak.last_deposit_date).toISOString().split('T')[0]
        : null;

      let newStreak = streak.current_streak;

      if (!lastDepositDate || lastDepositDate !== today) {
        // Check if it's consecutive
        if (lastDepositDate) {
          const daysDiff = Math.floor(
            (new Date(today) - new Date(lastDepositDate)) / (1000 * 60 * 60 * 24)
          );

          if (daysDiff === 1) {
            newStreak += 1;
          } else if (daysDiff > 1) {
            newStreak = 1; // Reset streak
          }
        } else {
          newStreak = 1;
        }

        const longestStreak = Math.max(newStreak, streak.longest_streak);

        await client.query(
          `UPDATE streaks
           SET current_streak = $1, longest_streak = $2, last_deposit_date = $3, total_deposits = total_deposits + 1
           WHERE user_id = $4`,
          [newStreak, longestStreak, today, userId]
        );
      }
    }

    // Add daily growth entry
    await client.query(
      `INSERT INTO daily_growth (user_id, date, has_deposit)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, date)
       DO UPDATE SET has_deposit = true`,
      [userId, today]
    );

    // Create transaction record
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, transaction_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        'deposit',
        amount,
        `Deposit${goalId ? ' to ' + (await client.query('SELECT title FROM savings_goals WHERE id = $1', [goalId])).rows[0]?.title : ''}`,
        transactionHash || null,
        'confirmed',
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      id: deposit.id,
      userId: deposit.user_id,
      goalId: deposit.goal_id,
      amount: parseFloat(deposit.amount),
      depositDate: deposit.deposit_date,
      status: deposit.status,
      message: 'Deposit successful',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create deposit error:', error);
    res.status(500).json({ error: 'Failed to create deposit', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/deposits/:depositId/status
 * Update deposit status
 */
router.put('/:depositId/status', async (req, res) => {
  try {
    const { depositId } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'confirmed', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      'UPDATE deposits SET status = $1 WHERE id = $2 RETURNING *',
      [status, depositId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    res.json({
      id: result.rows[0].id,
      status: result.rows[0].status,
      message: 'Deposit status updated',
    });
  } catch (error) {
    console.error('Update deposit status error:', error);
    res.status(500).json({ error: 'Failed to update deposit status', message: error.message });
  }
});

module.exports = router;
