# StackSave Backend API

Backend API for StackSave mobile application built with Express.js and PostgreSQL.

## Features

- User authentication and management
- Savings goals tracking
- Deposit management with automatic streak updates
- Transaction history
- Daily growth/earnings tracking
- Payment methods management
- Streak system (Duolingo-style)

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **pg** - PostgreSQL client for Node.js
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variable management

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb stacksave
```

Initialize the database schema:

```bash
psql -d stacksave -f db/schema.sql
```

Or use the npm script:

```bash
npm run db:init
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and update with your configuration:

```bash
cp .env.example .env
```

Update the `.env` file:

```
DATABASE_URL=postgresql://username:password@localhost:5432/stacksave
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:8081
```

### 4. Run the Server

**Development mode (with auto-reload):**

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check

- `GET /health` - Check API and database status

### Authentication

- `POST /api/auth/login` - Login or create user with wallet address
- `POST /api/auth/verify` - Verify wallet signature (placeholder)

### Users

- `GET /api/users/:userId` - Get user profile
- `PUT /api/users/:userId/mode` - Update user mode (lite/pro)
- `PUT /api/users/:userId/balance` - Update user balance
- `GET /api/users/:userId/growth` - Get daily growth data
- `POST /api/users/:userId/growth` - Add daily growth entry

### Savings Goals

- `GET /api/goals/:userId` - Get all goals for user
- `GET /api/goals/:userId/main` - Get main goal
- `POST /api/goals/:userId` - Create new goal
- `PUT /api/goals/:goalId` - Update goal
- `DELETE /api/goals/:goalId` - Delete goal

### Deposits

- `GET /api/deposits/:userId` - Get all deposits
- `POST /api/deposits/:userId` - Create new deposit (auto-updates goals, balance, streaks)
- `PUT /api/deposits/:depositId/status` - Update deposit status

### Transactions

- `GET /api/transactions/:userId` - Get all transactions
- `GET /api/transactions/:userId/recent` - Get recent transactions (last 10)
- `POST /api/transactions/:userId/withdrawal` - Create withdrawal
- `POST /api/transactions/:userId/earnings` - Record earnings
- `PUT /api/transactions/:transactionId/status` - Update transaction status

### Streaks

- `GET /api/streaks/:userId` - Get streak information
- `POST /api/streaks/:userId/check` - Check and update streak
- `POST /api/streaks/:userId/reset` - Reset current streak

### Payment Methods

- `GET /api/payment-methods/:userId` - Get all payment methods
- `GET /api/payment-methods/:userId/default` - Get default payment method
- `POST /api/payment-methods/:userId` - Add payment method
- `PUT /api/payment-methods/:paymentMethodId` - Update payment method
- `DELETE /api/payment-methods/:paymentMethodId` - Delete payment method

## Database Schema

### Tables

- **users** - User accounts and wallet addresses
- **savings_goals** - User savings goals
- **deposits** - Deposit records
- **transactions** - All transaction types (deposit, withdrawal, earnings)
- **streaks** - User streak tracking
- **daily_growth** - Daily earnings and growth tracking
- **payment_methods** - Linked payment methods

See `db/schema.sql` for complete schema definition.

## Project Structure

```
backend/
├── db/
│   └── schema.sql          # Database schema
├── src/
│   ├── config/
│   │   └── db.js           # Database connection
│   ├── routes/
│   │   ├── auth.js         # Authentication routes
│   │   ├── users.js        # User routes
│   │   ├── goals.js        # Goals routes
│   │   ├── deposits.js     # Deposits routes
│   │   ├── transactions.js # Transactions routes
│   │   ├── streaks.js      # Streaks routes
│   │   └── paymentMethods.js # Payment methods routes
│   └── index.js            # Main server file
├── .env.example            # Environment variables template
├── package.json
└── README.md
```

## Key Features

### Automatic Streak Updates

When a deposit is made, the system automatically:
- Updates the user's streak (increments if consecutive day)
- Resets streak if more than 1 day gap
- Updates longest streak if current exceeds it
- Tracks total number of deposits

### Transaction Handling

All deposit and withdrawal operations use database transactions to ensure data consistency:
- Updates user balance
- Updates goal progress
- Creates transaction records
- Updates streak data
- Records daily growth

### Growth Tracking

Daily growth data tracks:
- Earnings from yield/interest
- Growth percentage
- Whether user made a deposit that day

## Error Handling

All endpoints include proper error handling:
- 400 - Bad Request (validation errors)
- 404 - Not Found (resource doesn't exist)
- 500 - Internal Server Error (database/server errors)

Error responses include:
```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

## Development

The API uses:
- Connection pooling for efficient database queries
- Query logging in development mode
- Automatic timestamp updates via database triggers
- Graceful shutdown handling

## Future Enhancements

- [ ] JWT authentication for secure API access
- [ ] Rate limiting
- [ ] Input validation middleware
- [ ] API documentation with Swagger
- [ ] Unit and integration tests
- [ ] Blockchain integration for deposits/withdrawals
- [ ] Webhook support for payment providers
