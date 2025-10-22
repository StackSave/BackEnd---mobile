-- StackSave Database Schema
-- PostgreSQL Database Schema for StackSave Mobile App

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  mode VARCHAR(10) DEFAULT 'lite' CHECK (mode IN ('lite', 'pro')),
  total_balance DECIMAL(18, 6) DEFAULT 0,
  total_earnings DECIMAL(18, 6) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Savings Goals Table
CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  target_amount DECIMAL(18, 6) NOT NULL,
  current_amount DECIMAL(18, 6) DEFAULT 0,
  frequency VARCHAR(20) CHECK (frequency IN ('weekly', 'monthly')),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  is_main_goal BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deposits Table
CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES savings_goals(id) ON DELETE SET NULL,
  amount DECIMAL(18, 6) NOT NULL,
  deposit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  transaction_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table (Withdrawal, Internal Transfers, etc.)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer', 'earnings')),
  amount DECIMAL(18, 6) NOT NULL,
  description TEXT,
  transaction_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Streaks Table
CREATE TABLE streaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_deposit_date DATE,
  total_deposits INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Daily Growth Data Table (for tracking earnings over time)
CREATE TABLE daily_growth (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  growth_percentage DECIMAL(10, 6) DEFAULT 0,
  earnings DECIMAL(18, 6) DEFAULT 0,
  has_deposit BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);

-- Payment Methods Table
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('gopay', 'dana', 'ovo', 'bank', 'wallet')),
  account_name VARCHAR(255),
  account_number VARCHAR(255),
  wallet_address VARCHAR(255),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pool Allocations Table (for portfolio management)
CREATE TABLE pool_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_type VARCHAR(50) NOT NULL CHECK (pool_type IN ('stablecoin', 'lending', 'dex', 'staking', 'yield_aggregator')),
  protocol_id VARCHAR(100) NOT NULL,
  protocol_name VARCHAR(255) NOT NULL,
  protocol_address VARCHAR(255),
  amount_allocated DECIMAL(18, 6) NOT NULL DEFAULT 0,
  current_apy DECIMAL(10, 6) DEFAULT 0,
  total_earnings DECIMAL(18, 6) DEFAULT 0,
  daily_earnings DECIMAL(18, 6) DEFAULT 0,
  allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, protocol_id, pool_type)
);

-- Allocation History Table (tracks how deposits were allocated)
CREATE TABLE allocation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deposit_id UUID REFERENCES deposits(id) ON DELETE SET NULL,
  deposit_amount DECIMAL(18, 6) NOT NULL,
  allocations JSONB NOT NULL, -- Array of {poolType, protocolId, protocolName, amount, percentage, apy}
  user_mode VARCHAR(20) NOT NULL CHECK (user_mode IN ('lite', 'balanced', 'pro')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_goals_user ON savings_goals(user_id);
CREATE INDEX idx_goals_main ON savings_goals(is_main_goal);
CREATE INDEX idx_deposits_user ON deposits(user_id);
CREATE INDEX idx_deposits_goal ON deposits(goal_id);
CREATE INDEX idx_deposits_date ON deposits(deposit_date);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_date ON transactions(created_at);
CREATE INDEX idx_streaks_user ON streaks(user_id);
CREATE INDEX idx_daily_growth_user_date ON daily_growth(user_id, date);
CREATE INDEX idx_payment_methods_user ON payment_methods(user_id);
CREATE INDEX idx_pool_allocations_user ON pool_allocations(user_id);
CREATE INDEX idx_pool_allocations_pool_type ON pool_allocations(pool_type);
CREATE INDEX idx_allocation_history_user ON allocation_history(user_id);
CREATE INDEX idx_allocation_history_deposit ON allocation_history(deposit_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_savings_goals_updated_at BEFORE UPDATE ON savings_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_streaks_updated_at BEFORE UPDATE ON streaks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pool_allocations_updated_at BEFORE UPDATE ON pool_allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
