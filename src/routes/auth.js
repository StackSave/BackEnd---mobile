const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

/**
 * POST /api/auth/connect-wallet
 * Connect wallet and create/login user (wallet-only authentication)
 */
router.post('/connect-wallet', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Normalize wallet address to lowercase
    const normalizedAddress = walletAddress.toLowerCase();

    // Check if user exists
    let result = await query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [normalizedAddress]
    );

    let user;

    if (result.rows.length === 0) {
      // Create new user (wallet-only, no email required)
      result = await query(
        `INSERT INTO users (wallet_address, mode, total_balance, total_earnings)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [normalizedAddress, 'lite', 0, 0]
      );

      user = result.rows[0];

      // Initialize streak for new user
      await query(
        `INSERT INTO streaks (user_id, current_streak, longest_streak, total_deposits)
         VALUES ($1, $2, $3, $4)`,
        [user.id, 0, 0, 0]
      );

      console.log(`✅ New user created: ${user.id} (${normalizedAddress})`);
    } else {
      user = result.rows[0];
      console.log(`✅ User reconnected: ${user.id} (${normalizedAddress})`);
    }

    res.json({
      message: 'Wallet connected successfully',
      user: {
        id: user.id,
        walletAddress: user.wallet_address,
        mode: user.mode,
        totalBalance: parseFloat(user.total_balance),
        totalEarnings: parseFloat(user.total_earnings),
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Connect wallet error:', error);
    res.status(500).json({ error: 'Failed to connect wallet', message: error.message });
  }
});

/**
 * POST /api/auth/verify
 * Verify wallet signature (placeholder for future implementation)
 */
router.post('/verify', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;

    // TODO: Implement signature verification
    // This would verify the signature using ethers.js or web3.js
    // For now, just return success

    res.json({
      verified: true,
      message: 'Signature verified successfully',
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed', message: error.message });
  }
});

module.exports = router;
