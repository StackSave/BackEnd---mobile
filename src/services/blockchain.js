const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

// Load contract ABIs
const stackSaveABI = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../abi/StackSaveSimple.json'), 'utf8')
);
const usdcABI = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../abi/MockUSDC.json'), 'utf8')
);

class BlockchainService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.stackSaveAddress = process.env.STACKSAVE_ADDRESS;
    this.usdcAddress = process.env.USDC_ADDRESS;

    this.stackSaveContract = new ethers.Contract(
      this.stackSaveAddress,
      stackSaveABI,
      this.provider
    );

    this.usdcContract = new ethers.Contract(
      this.usdcAddress,
      usdcABI,
      this.provider
    );
  }

  async getUserGoals(userAddress) {
    try {
      const goals = await this.stackSaveContract.getUserGoals(userAddress);
      return goals.map((goal, index) => ({
        goalId: index,
        name: goal.name,
        targetAmount: ethers.formatUnits(goal.targetAmount, 6),
        currentAmount: ethers.formatUnits(goal.currentAmount, 6),
        createdAt: Number(goal.createdAt),
        completed: goal.completed
      }));
    } catch (error) {
      console.error('Error fetching user goals:', error);
      throw error;
    }
  }

  async getUserBalance(userAddress) {
    try {
      const balance = await this.stackSaveContract.balances(userAddress);
      return ethers.formatUnits(balance, 6);
    } catch (error) {
      console.error('Error fetching user balance:', error);
      throw error;
    }
  }

  async getTotalBalance(userAddress) {
    try {
      const totalBalance = await this.stackSaveContract.getTotalBalance(userAddress);
      return ethers.formatUnits(totalBalance, 6);
    } catch (error) {
      console.error('Error fetching total balance:', error);
      throw error;
    }
  }

  async getPendingInterest(userAddress) {
    try {
      const interest = await this.stackSaveContract.pendingInterest(userAddress);
      return ethers.formatUnits(interest, 6);
    } catch (error) {
      console.error('Error fetching pending interest:', error);
      throw error;
    }
  }

  async getUserStats(userAddress) {
    try {
      const stats = await this.stackSaveContract.getUserStats(userAddress);
      return {
        totalDeposited: ethers.formatUnits(stats[0], 6),
        totalEarned: ethers.formatUnits(stats[1], 6),
        streakDays: Number(stats[2]),
        pendingRewards: ethers.formatUnits(stats[3], 6)
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      throw error;
    }
  }

  async getUSDCBalance(userAddress) {
    try {
      const balance = await this.usdcContract.balanceOf(userAddress);
      return ethers.formatUnits(balance, 6);
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
      throw error;
    }
  }

  async getTotalDeposits() {
    try {
      const total = await this.stackSaveContract.totalDeposits();
      return ethers.formatUnits(total, 6);
    } catch (error) {
      console.error('Error fetching total deposits:', error);
      throw error;
    }
  }

  async getTransactionReceipt(txHash) {
    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      console.error('Error fetching transaction receipt:', error);
      throw error;
    }
  }
}

let blockchainService = null;

function getBlockchainService() {
  if (!blockchainService) {
    blockchainService = new BlockchainService();
  }
  return blockchainService;
}

module.exports = { BlockchainService, getBlockchainService };
