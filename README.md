# MM Lending Protocol

A decentralized lending protocol built on the Bittensor network implementing overcollateralized borrowing with algorithmic interest rates, on-chain liquidations, and manipulation-resistant TWAP price oracles.

## Overview

The MM Lending Protocol enables TAO holders to earn yield by supplying liquidity and allows users to borrow TAO by depositing ALPHA tokens as collateral. The protocol operates entirely on-chain through a remark-based state synchronization system.

## How It Works

### Protocol Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       USERS (Lenders/Borrowers)                 │
│                                                                 │
│  Write USER_ACTION remarks to blockchain                        │
│  (deposit, withdraw, borrow, repay, deposit_collateral)         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BLOCKCHAIN                                 │
│                                                                 │
│  • Remarks stored in system.remark extrinsics                   │
│  • TAO/ALPHA transfers via balances.transfer / transferStake    │
│      or removeStakeLimit                                        │
│  • Immutable event log                                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PROTOCOL SCANNER                              │
│                                                                 │
│  Continuously scans blockchain :                                │
│  1. Read new USER_ACTION remarks                                │
│  2. Validate & process actions                                  │
│  3. Update in-memory state                                      │
│  4. Write STATE_OF_MARKET remarks                               │
│  5. Execute protocol transactions                               │
│  6. Monitor position health                                     │
└─────────────────────────────────────────────────────────────────┘
```

### State Synchronization Flow

```
USER ACTION                  SCANNER PROCESSING               PROTOCOL RESPONSE
───────────                  ──────────────────               ─────────────────

1. Deposit TAO              → Verify TAO transfer            → Write STATE_OF_MARKET
   (user sends TAO)           Calculate shares                 (update supply)
   Write USER remark          Update state

2. Borrow TAO               → Verify collateral              → Write STATE_OF_MARKET
   (has collateral)           Check health factor               (with action_in_progress)
   Write USER remark          Calculate borrow shares         → Send TAO to borrower
                                                              → Write final STATE_OF_MARKET

3. Liquidation              → Detect unhealthy position      → Unstake collateral
                             Calculate seizure amount          Convert ALPHA → TAO
                              Verify profitability            → Write STATE_OF_MARKET
                                                                (debt cleared)
```

## Core Components

### 1. Remark-Based State System

**USER_ACTION Remarks** (written by users):
- Contains: action type, amounts, timestamps, linked transaction hashes
- Actions: deposit, withdraw, borrow, repay, deposit_collateral, withdraw_collateral

**STATE_OF_MARKET Remarks** (written by protocol):
- Contains: complete market state snapshot
- Includes: total supply/borrow, all user positions, interest rates, LTV/LLTV parameters
- Written after every state change
- Serves as source of truth for protocol state

### 2. Protocol Scanner

**Main Loop:**
```
Priority 1: Process USER_ACTION remarks
  ├─ Validate remark structure
  ├─ Verify on-chain transactions
  ├─ Update market state
  └─ Write STATE_OF_MARKET

Priority 2: Execute pending actions
  ├─ Check actions_in_progress
  ├─ Send protocol transactions (withdrawals, borrows)
  └─ Write final STATE_OF_MARKET

Priority 3: Monitor liquidations
  ├─ Check all borrower health factors
  ├─ Execute liquidations if health < 1.0
  └─ Update state after liquidation
```

**Scanner Features:**
- **State Persistence**: Backs up state to disk after each operation
- **Restore Mode**: Can restart from last backup
- **Fresh Mode**: Starts from current block, ignores history
- **TWAP Price Feeds**: Maintains rolling TWAP price data for ALPHA tokens
- **Action Monitoring**: Tracks pending protocol transactions until completion

### 3. User Operations

#### Lender Operations

**Deposit TAO:**
1. User transfers TAO to protocol coldkey
2. User writes USER_ACTION remark (deposit)
3. Scanner verifies transfer
4. Scanner mints supply shares
5. Scanner writes STATE_OF_MARKET

**Withdraw TAO:**
1. User writes USER_ACTION remark (withdraw)
2. Scanner calculates TAO amount from shares
3. Scanner writes STATE_OF_MARKET (with action_in_progress)
4. Scanner sends TAO to user
5. Scanner writes final STATE_OF_MARKET

#### Borrower Operations

**Deposit Collateral:**
1. User transfers ALPHA to protocol (via transferStake)
2. User writes USER_ACTION remark (deposit_collateral)
3. Scanner verifies ALPHA transfer
4. Scanner records collateral amount
5. Scanner writes STATE_OF_MARKET

**Borrow TAO:**
1. User writes USER_ACTION remark (borrow)
2. Scanner checks collateral and health factor
3. Scanner mints borrow shares
4. Scanner writes STATE_OF_MARKET (with action_in_progress)
5. Scanner sends TAO to user
6. Scanner writes final STATE_OF_MARKET

**Repay TAO:**
1. User transfers TAO to protocol coldkey
2. User writes USER_ACTION remark (repay)
3. Scanner verifies transfer
4. Scanner burns borrow shares
5. Scanner writes STATE_OF_MARKET

**Withdraw Collateral:**
1. User writes USER_ACTION remark (withdraw_collateral)
2. Scanner checks remaining health factor > 1.0
3. Scanner writes STATE_OF_MARKET (with action_in_progress)
4. Scanner transfers ALPHA back to user (via transferStake)
5. Scanner writes final STATE_OF_MARKET

### 4. Liquidation System

**Detection:**
- Scanner continuously monitors all borrower positions
- Calculates health factor: `(Collateral Value * LLTV) / Debt`
- Position is liquidatable when health factor < 1.0

**Execution:**
1. Scanner detects unhealthy position
2. Calculates ALPHA to seize (debt + liquidation bonus)
3. Unstakes ALPHA collateral (converts ALPHA → TAO via removeStakeLimit)
4. Uses TAO to cover debt
5. Protocol keeps liquidation bonus as reserves
6. Updates borrower position (debt cleared, collateral reduced)
7. Writes STATE_OF_MARKET

**Slippage Protection:**
- Sets minimum acceptable ALPHA→TAO price
- Transaction fails if price drops beyond tolerance (default 5%)

### 5. Interest Rate Model

**Adaptive IRM:**
- Interest rates dynamically adjust based on pool utilization
- Higher utilization → higher rates
- Lower utilization → lower rates

**Continuous Accrual:**
- Interest compounds every second
- Calculated using time elapsed since last update
- Applied automatically when any action occurs

**Share-Based Accounting:**
- Supply shares: represent claim on growing pool
- Borrow shares: represent growing debt obligation
- Exchange rates update with interest accrual

### 6. TWAP Price Oracle

**Purpose:**
- Provides manipulation-resistant ALPHA token prices
- Used for collateral valuation and health calculations


## Key Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **LTV** | 50% | Maximum borrow ratio for new borrows |
| **LLTV** | 75% | Liquidation threshold (updated to 0.1% for testing) |
| **Liquidation Bonus** | 5-15% | Dynamic bonus based on LLTV (lower LLTV = higher bonus) |
| **Protocol Fee** | 3% | Fee on interest earned |
| **Liquidation Slippage** | 5% | Max price slippage during unstaking |
| **Scan Interval** | 12 seconds | Block time (1 block) |
| **TWAP Window** | 1 hour | Price averaging period |

## State Management

**In-Memory State:**
- MarketStateManager: total supply, borrow, reserves, rates, LTV/LLTV
- PositionStateManager: per-user supply shares, borrow shares, collateral

**Disk Backup:**
- Automatic backup after each STATE_OF_MARKET write
- Location: `.protocol-state-backup/latest-state.json`
- Contains: full market state + all user positions
- Used for scanner restart/recovery

**State Restoration:**
- Scanner can restart in RESTORE mode: `npm run scanner -- --restore`
- Loads state from disk backup
- Continues from last processed block
- No need to re-scan entire blockchain

## Running the Scanner

```bash
# Start scanner in FRESH mode (ignore backup, start from current block)
npm run scanner

# Start scanner in RESTORE mode (continue from last backup)
npm run scanner -- --restore
npm run scanner -- -r

# Scanner will display:
# - Block scanning progress
# - USER remarks detected
# - Actions processed
# - Liquidations executed
# - State updates
```

## Testing Liquidations

1. Run scanner in FRESH mode
2. Execute test script to create positions
3. Wait for healthy state (steps 1-3)
4. Stop scanner
5. Edit `.protocol-state-backup/latest-state.json` - change `lltv` to `0.001`
6. Restart scanner in RESTORE mode: `npm run scanner -- --restore`
7. Scanner will detect position as liquidatable and execute liquidation


## Architecture

```
src/services/lending/
├── actions/                          # User Action Handlers
│   ├── deposit.ts                   # Lender deposit TAO
│   ├── withdraw.ts                  # Lender withdraw TAO
│   ├── collateral.ts                # Deposit/withdraw collateral
│   ├── borrow.ts                    # Borrow TAO against collateral
│   ├── repay.ts                     # Repay borrowed TAO
│   └── liquidate.ts                 # Liquidate unhealthy positions
├── core/                            # Core Protocol Logic
│   ├── protocol-scanner.ts          # Main scanner loop
│   ├── interest-calculations.ts     # Interest rate model and accrual
│   ├── shares-calculations.ts       # Asset-shares conversions
│   ├── health-calculations.ts       # Health factor and risk metrics
│   ├── liquidation-calculations.ts  # Liquidation logic and incentives
│   └── state-persistence.ts         # State backup/restore
├── state/                           # State Management
│   ├── market-state.ts              # Market-level state
│   └── position-state.ts            # User position state
├── modules/                         # External Integrations
│   └── call/
│       ├── subnetData.ts            # TWAP price oracle
│       └── stakeTransfer.ts         # ALPHA staking operations
├── utils/                           # Utilities
│   ├── remark-reader.ts             # Read remarks from blockchain
│   ├── remark-writer.ts             # Write remarks to blockchain
│   ├── provider.ts                  # Archive node connections
│   └── transaction-verifier.ts      # Verify on-chain transactions
├── types/                           # TypeScript Definitions
│   └── index.ts                     # All interfaces and types
├── config.ts                        # Protocol parameters
└── test-process/                    # Live Testing Scripts
```

## Development

```bash
# Install dependencies
npm install

# Type checking
npx tsc --noEmit

# Run tests
npm test

# Run specific test
npm test -- full-process.vitest.ts

# Watch mode
npm run test:watch
```

