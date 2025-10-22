const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

/**
 * GET /api/payment-methods/:userId
 * Get all payment methods for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activeOnly } = req.query;

    let queryText = 'SELECT * FROM payment_methods WHERE user_id = $1';
    const params = [userId];

    if (activeOnly === 'true') {
      queryText += ' AND is_active = true';
    }

    queryText += ' ORDER BY is_default DESC, created_at DESC';

    const result = await query(queryText, params);

    const paymentMethods = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      accountName: row.account_name,
      accountNumber: row.account_number,
      walletAddress: row.wallet_address,
      isDefault: row.is_default,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(paymentMethods);
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to get payment methods', message: error.message });
  }
});

/**
 * GET /api/payment-methods/:userId/default
 * Get default payment method for a user
 */
router.get('/:userId/default', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT * FROM payment_methods
       WHERE user_id = $1 AND is_default = true AND is_active = true
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No default payment method found' });
    }

    const row = result.rows[0];
    const paymentMethod = {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      accountName: row.account_name,
      accountNumber: row.account_number,
      walletAddress: row.wallet_address,
      isDefault: row.is_default,
      isActive: row.is_active,
    };

    res.json(paymentMethod);
  } catch (error) {
    console.error('Get default payment method error:', error);
    res.status(500).json({ error: 'Failed to get default payment method', message: error.message });
  }
});

/**
 * POST /api/payment-methods/:userId
 * Add a new payment method
 */
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, accountName, accountNumber, walletAddress, isDefault } = req.body;

    // Validation
    if (!type || !['gopay', 'dana', 'ovo', 'bank', 'wallet'].includes(type)) {
      return res.status(400).json({ error: 'Invalid payment method type' });
    }

    if (type === 'wallet' && !walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required for wallet type' });
    }

    if (['gopay', 'dana', 'ovo', 'bank'].includes(type) && !accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    // If this is being set as default, unset other default payment methods
    if (isDefault) {
      await query(
        'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
        [userId]
      );
    }

    const result = await query(
      `INSERT INTO payment_methods (user_id, type, account_name, account_number, wallet_address, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        type,
        accountName || null,
        accountNumber || null,
        walletAddress || null,
        isDefault || false,
        true,
      ]
    );

    const row = result.rows[0];
    const paymentMethod = {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      accountName: row.account_name,
      accountNumber: row.account_number,
      walletAddress: row.wallet_address,
      isDefault: row.is_default,
      isActive: row.is_active,
      createdAt: row.created_at,
    };

    res.status(201).json(paymentMethod);
  } catch (error) {
    console.error('Create payment method error:', error);
    res.status(500).json({ error: 'Failed to create payment method', message: error.message });
  }
});

/**
 * PUT /api/payment-methods/:paymentMethodId
 * Update a payment method
 */
router.put('/:paymentMethodId', async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const { accountName, accountNumber, walletAddress, isDefault, isActive } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (accountName !== undefined) {
      updates.push(`account_name = $${paramIndex++}`);
      values.push(accountName);
    }
    if (accountNumber !== undefined) {
      updates.push(`account_number = $${paramIndex++}`);
      values.push(accountNumber);
    }
    if (walletAddress !== undefined) {
      updates.push(`wallet_address = $${paramIndex++}`);
      values.push(walletAddress);
    }
    if (isDefault !== undefined) {
      updates.push(`is_default = $${paramIndex++}`);
      values.push(isDefault);

      // If setting as default, unset other defaults
      if (isDefault) {
        const methodResult = await query(
          'SELECT user_id FROM payment_methods WHERE id = $1',
          [paymentMethodId]
        );
        if (methodResult.rows.length > 0) {
          await query(
            'UPDATE payment_methods SET is_default = false WHERE user_id = $1 AND id != $2',
            [methodResult.rows[0].user_id, paymentMethodId]
          );
        }
      }
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(paymentMethodId);

    const result = await query(
      `UPDATE payment_methods SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    const row = result.rows[0];
    const paymentMethod = {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      accountName: row.account_name,
      accountNumber: row.account_number,
      walletAddress: row.wallet_address,
      isDefault: row.is_default,
      isActive: row.is_active,
      updatedAt: row.updated_at,
    };

    res.json(paymentMethod);
  } catch (error) {
    console.error('Update payment method error:', error);
    res.status(500).json({ error: 'Failed to update payment method', message: error.message });
  }
});

/**
 * DELETE /api/payment-methods/:paymentMethodId
 * Delete a payment method (soft delete by setting is_active = false)
 */
router.delete('/:paymentMethodId', async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const { hardDelete } = req.query;

    if (hardDelete === 'true') {
      // Hard delete - permanently remove from database
      const result = await query(
        'DELETE FROM payment_methods WHERE id = $1 RETURNING *',
        [paymentMethodId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Payment method not found' });
      }

      res.json({ message: 'Payment method permanently deleted' });
    } else {
      // Soft delete - set is_active to false
      const result = await query(
        'UPDATE payment_methods SET is_active = false WHERE id = $1 RETURNING *',
        [paymentMethodId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Payment method not found' });
      }

      res.json({ message: 'Payment method deactivated' });
    }
  } catch (error) {
    console.error('Delete payment method error:', error);
    res.status(500).json({ error: 'Failed to delete payment method', message: error.message });
  }
});

module.exports = router;
