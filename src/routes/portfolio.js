const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/db');
const blockchainService = require('../services/blockchain');

/**
 * GET /api/portfolio/:userId
 * Get user's complete portfolio breakdown
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all pool allocations for user
    const allocationsResult = await query(
      `SELECT * FROM pool_allocations
       WHERE user_id = $1
       ORDER BY amount_allocated DESC`,
      [userId]
    );

    const allocations = allocationsResult.rows.map(row => ({
      id: row.id,
      poolType: row.pool_type,
      protocolId: row.protocol_id,
      protocolName: row.protocol_name,
      protocolAddress: row.protocol_address,
      amountAllocated: parseFloat(row.amount_allocated),
      currentAPY: parseFloat(row.current_apy),
      totalEarnings: parseFloat(row.total_earnings),
      dailyEarnings: parseFloat(row.daily_earnings),
      allocatedAt: row.allocated_at,
      lastUpdated: row.last_updated,
    }));

    // Calculate portfolio metrics
    const totalValue = allocations.reduce((sum, a) => sum + a.amountAllocated, 0);
    const totalEarnings = allocations.reduce((sum, a) => sum + a.totalEarnings, 0);
    const averageAPY = totalValue > 0
      ? allocations.reduce((sum, a) => sum + (a.amountAllocated / totalValue) * a.currentAPY, 0)
      : 0;
    const dailyChange = allocations.reduce((sum, a) => sum + a.dailyEarnings, 0);

    res.json({
      allocations,
      performance: {
        totalValue,
        totalEarnings,
        averageAPY,
        dailyChange,
        dailyChangePercentage: totalValue > 0 ? (dailyChange / totalValue) * 100 : 0,
        weeklyChange: dailyChange * 7,
        monthlyChange: dailyChange * 30,
      },
    });
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({ error: 'Failed to get portfolio', message: error.message });
  }
});

/**
 * GET /api/portfolio/:userId/by-type/:poolType
 * Get allocations for a specific pool type
 */
router.get('/:userId/by-type/:poolType', async (req, res) => {
  try {
    const { userId, poolType } = req.params;

    const result = await query(
      `SELECT * FROM pool_allocations
       WHERE user_id = $1 AND pool_type = $2
       ORDER BY amount_allocated DESC`,
      [userId, poolType]
    );

    const allocations = result.rows.map(row => ({
      id: row.id,
      poolType: row.pool_type,
      protocolId: row.protocol_id,
      protocolName: row.protocol_name,
      amountAllocated: parseFloat(row.amount_allocated),
      currentAPY: parseFloat(row.current_apy),
      totalEarnings: parseFloat(row.total_earnings),
      dailyEarnings: parseFloat(row.daily_earnings),
      allocatedAt: row.allocated_at,
    }));

    const totalAmount = allocations.reduce((sum, a) => sum + a.amountAllocated, 0);

    res.json({
      poolType,
      allocations,
      totalAmount,
    });
  } catch (error) {
    console.error('Get allocations by type error:', error);
    res.status(500).json({ error: 'Failed to get allocations', message: error.message });
  }
});

/**
 * POST /api/portfolio/:userId/allocate
 * Allocate a deposit across multiple pools
 */
router.post('/:userId/allocate', async (req, res) => {
  const client = await getClient();

  try {
    const { userId } = req.params;
    const { depositId, depositAmount, allocations, userMode } = req.body;

    // Validation
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'Allocations array is required' });
    }

    if (!userMode || !['lite', 'balanced', 'pro'].includes(userMode)) {
      return res.status(400).json({ error: 'Valid user mode is required' });
    }

    await client.query('BEGIN');

    const createdAllocations = [];

    // Process each allocation
    for (const alloc of allocations) {
      const {
        poolType,
        protocolId,
        protocolName,
        protocolAddress,
        amount,
        percentage,
        apy,
      } = alloc;

      // Upsert pool allocation (merge if exists, create if not)
      const result = await client.query(
        `INSERT INTO pool_allocations
         (user_id, pool_type, protocol_id, protocol_name, protocol_address, amount_allocated, current_apy, daily_earnings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, protocol_id, pool_type)
         DO UPDATE SET
           amount_allocated = pool_allocations.amount_allocated + EXCLUDED.amount_allocated,
           current_apy = EXCLUDED.current_apy,
           daily_earnings = (pool_allocations.amount_allocated + EXCLUDED.amount_allocated) * EXCLUDED.current_apy / 365 / 100,
           last_updated = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          userId,
          poolType,
          protocolId,
          protocolName,
          protocolAddress || null,
          amount,
          apy,
          (amount * apy) / 365 / 100,
        ]
      );

      createdAllocations.push(result.rows[0]);
    }

    // Record allocation history
    await client.query(
      `INSERT INTO allocation_history (user_id, deposit_id, deposit_amount, allocations, user_mode)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, depositId || null, depositAmount, JSON.stringify(allocations), userMode]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Deposit allocated successfully',
      allocations: createdAllocations.map(row => ({
        id: row.id,
        poolType: row.pool_type,
        protocolId: row.protocol_id,
        protocolName: row.protocol_name,
        amountAllocated: parseFloat(row.amount_allocated),
        currentAPY: parseFloat(row.current_apy),
        dailyEarnings: parseFloat(row.daily_earnings),
      })),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Allocate deposit error:', error);
    res.status(500).json({ error: 'Failed to allocate deposit', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/portfolio/:userId/history
 * Get allocation history
 */
router.get('/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    const result = await query(
      `SELECT * FROM allocation_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const history = result.rows.map(row => ({
      id: row.id,
      depositId: row.deposit_id,
      depositAmount: parseFloat(row.deposit_amount),
      allocations: row.allocations,
      userMode: row.user_mode,
      createdAt: row.created_at,
    }));

    res.json(history);
  } catch (error) {
    console.error('Get allocation history error:', error);
    res.status(500).json({ error: 'Failed to get allocation history', message: error.message });
  }
});

/**
 * PUT /api/portfolio/:userId/update-earnings
 * Update earnings for all allocations (called by cron job or periodic update)
 */
router.put('/:userId/update-earnings', async (req, res) => {
  const client = await getClient();

  try {
    const { userId } = req.params;

    await client.query('BEGIN');

    // Get all allocations
    const allocations = await client.query(
      'SELECT * FROM pool_allocations WHERE user_id = $1',
      [userId]
    );

    let totalNewEarnings = 0;

    // Update each allocation with new earnings
    for (const alloc of allocations.rows) {
      const dailyEarning = (parseFloat(alloc.amount_allocated) * parseFloat(alloc.current_apy)) / 365 / 100;
      totalNewEarnings += dailyEarning;

      await client.query(
        `UPDATE pool_allocations
         SET total_earnings = total_earnings + $1,
             daily_earnings = $2,
             last_updated = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [dailyEarning, dailyEarning, alloc.id]
      );
    }

    // Update user's total earnings
    await client.query(
      'UPDATE users SET total_earnings = total_earnings + $1 WHERE id = $2',
      [totalNewEarnings, userId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Earnings updated successfully',
      totalNewEarnings,
      updatedAllocations: allocations.rows.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update earnings error:', error);
    res.status(500).json({ error: 'Failed to update earnings', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/portfolio/:userId/allocation/:allocationId
 * Remove a specific pool allocation (withdraw from pool)
 */
router.delete('/:userId/allocation/:allocationId', async (req, res) => {
  const client = await getClient();

  try {
    const { userId, allocationId } = req.params;

    await client.query('BEGIN');

    // Get allocation details
    const result = await client.query(
      'SELECT * FROM pool_allocations WHERE id = $1 AND user_id = $2',
      [allocationId, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Allocation not found' });
    }

    const allocation = result.rows[0];
    const amount = parseFloat(allocation.amount_allocated);

    // Delete allocation
    await client.query('DELETE FROM pool_allocations WHERE id = $1', [allocationId]);

    // Update user balance (return funds to wallet)
    await client.query(
      'UPDATE users SET total_balance = total_balance + $1 WHERE id = $2',
      [amount, userId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Allocation removed successfully',
      withdrawnAmount: amount,
      poolType: allocation.pool_type,
      protocolName: allocation.protocol_name,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete allocation error:', error);
    res.status(500).json({ error: 'Failed to delete allocation', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/portfolio/protocols/apy
 * Get current APY for all protocols
 */
router.get('/protocols/apy', async (req, res) => {
  try {
    const protocols = await blockchainService.getAllProtocolsWithAPY();
    res.json({
      protocols,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get protocols APY error:', error);
    res.status(500).json({ error: 'Failed to fetch APY data', message: error.message });
  }
});

/**
 * GET /api/portfolio/protocols/apy/:protocolId
 * Get current APY for a specific protocol
 */
router.get('/protocols/apy/:protocolId', async (req, res) => {
  try {
    const { protocolId } = req.params;
    const apy = await blockchainService.getProtocolAPY(protocolId);

    res.json({
      protocolId,
      currentAPY: apy,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get protocol APY error:', error);
    res.status(500).json({ error: 'Failed to fetch APY', message: error.message });
  }
});

/**
 * POST /api/portfolio/protocols/apy/batch
 * Get APY for multiple protocols at once
 */
router.post('/protocols/apy/batch', async (req, res) => {
  try {
    const { protocolIds } = req.body;

    if (!protocolIds || !Array.isArray(protocolIds)) {
      return res.status(400).json({ error: 'protocolIds array is required' });
    }

    const apyData = await blockchainService.getBatchAPY(protocolIds);

    res.json({
      data: apyData,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get batch APY error:', error);
    res.status(500).json({ error: 'Failed to fetch batch APY', message: error.message });
  }
});

/**
 * DELETE /api/portfolio/protocols/cache
 * Clear APY cache (admin/testing endpoint)
 */
router.delete('/protocols/cache', async (req, res) => {
  try {
    blockchainService.clearCache();
    res.json({ message: 'APY cache cleared successfully' });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: 'Failed to clear cache', message: error.message });
  }
});

module.exports = router;
