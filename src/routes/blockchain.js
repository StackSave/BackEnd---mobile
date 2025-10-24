const express = require('express');
const router = express.Router();
const { getBlockchainService } = require('../services/blockchain');

// Get blockchain service instance
const blockchainService = getBlockchainService();

/**
 * GET /api/blockchain/goals/:address
 * Get all goals for a user from blockchain
 */
router.get('/goals/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const goals = await blockchainService.getUserGoals(address);

    res.json({
      success: true,
      data: goals
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch goals from blockchain',
      message: error.message
    });
  }
});

/**
 * GET /api/blockchain/balance/:address
 * Get user balance from blockchain
 */
router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const balance = await blockchainService.getUserBalance(address);
    const totalBalance = await blockchainService.getTotalBalance(address);
    const pendingInterest = await blockchainService.getPendingInterest(address);

    res.json({
      success: true,
      data: {
        balance,
        totalBalance,
        pendingInterest
      }
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch balance from blockchain',
      message: error.message
    });
  }
});

/**
 * GET /api/blockchain/stats/:address
 * Get user statistics from blockchain
 */
router.get('/stats/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const stats = await blockchainService.getUserStats(address);
    const usdcBalance = await blockchainService.getUSDCBalance(address);

    res.json({
      success: true,
      data: {
        ...stats,
        usdcBalance
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats from blockchain',
      message: error.message
    });
  }
});

/**
 * GET /api/blockchain/total-deposits
 * Get total deposits in contract
 */
router.get('/total-deposits', async (req, res) => {
  try {
    const totalDeposits = await blockchainService.getTotalDeposits();

    res.json({
      success: true,
      data: {
        totalDeposits
      }
    });
  } catch (error) {
    console.error('Error fetching total deposits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch total deposits',
      message: error.message
    });
  }
});

/**
 * GET /api/blockchain/transaction/:txHash
 * Get transaction receipt
 */
router.get('/transaction/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    const receipt = await blockchainService.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed.toString(),
        from: receipt.from,
        to: receipt.to
      }
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction',
      message: error.message
    });
  }
});

/**
 * POST /api/blockchain/sync/:userId
 * Sync on-chain data to database for a user
 */
router.post('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    // Fetch data from blockchain
    const goals = await blockchainService.getUserGoals(walletAddress);
    const stats = await blockchainService.getUserStats(walletAddress);
    const balance = await blockchainService.getUserBalance(walletAddress);

    // Here you would sync this data to your database
    // For now, just return the data

    res.json({
      success: true,
      message: 'Data synced successfully',
      data: {
        goals,
        stats,
        balance
      }
    });
  } catch (error) {
    console.error('Error syncing data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync data',
      message: error.message
    });
  }
});

/**
 * GET /api/blockchain/contract-info
 * Get contract addresses and network info
 */
router.get('/contract-info', (req, res) => {
  res.json({
    success: true,
    data: {
      stackSaveAddress: process.env.STACKSAVE_ADDRESS,
      usdcAddress: process.env.USDC_ADDRESS,
      network: process.env.BLOCKCHAIN_NETWORK || 'base-sepolia',
      chainId: process.env.CHAIN_ID || '84532',
      rpcUrl: process.env.RPC_URL,
      blockExplorer: process.env.EXPO_PUBLIC_BLOCK_EXPLORER || 'https://sepolia.basescan.org'
    }
  });
});

module.exports = router;
