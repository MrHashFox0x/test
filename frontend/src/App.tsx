import { useState, useCallback } from "react";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { MarketStats } from "./components/MarketStats";
import { MarketInfo } from "./components/MarketInfo";
import { InterestRateChart } from "./components/InterestRateChart";
import { UserPosition } from "./components/UserPosition";
import { EarnPanel } from "./components/panels/EarnPanel";
import { BorrowPanel } from "./components/panels/BorrowPanel";
import { useWallet } from "./hooks/useWallet";
import { useMarketData } from "./hooks/useMarketData";
import { useUserPosition } from "./hooks/useUserPosition";
import { useAlphaPrice } from "./hooks/useAlphaPrice";
import { useTaoBalance } from "./hooks/useTaoBalance";

import { useTransactionProgress } from "./hooks/useTransactionProgress";
import { TransactionProgress } from "./components/TransactionProgress";
import { toast } from "sonner";
import { executeDeposit, executeWithdraw, executeDepositAndBorrow, executeRepay, executeRepayAndWithdrawCollateral } from "./utils/transactions";
import { calculateMaxBorrow, calculateHealthFactor } from "./utils/alphaPrice";
import { calculateOutstandingDebt, getRepayBreakdown, getWithdrawBreakdown } from "./utils/adaptiveIRM";

export default function App() {
  const [activeTab, setActiveTab] = useState<'borrow' | 'earn'>('earn');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [withdrawCollateralAmount, setWithdrawCollateralAmount] = useState('');
  const [isTransacting, setIsTransacting] = useState(false);
  const [txStatus, setTxStatus] = useState<string>('');
  const [txError, setTxError] = useState<string | null>(null);

  const { account, accounts, isConnecting, isConnected, connectWallet, disconnectWallet, selectAccount } = useWallet();
  const { data: marketDataRaw, rawMarketState, isLoading: isLoadingMarket, error: marketError, refresh: refreshMarket } = useMarketData();
  const { position, isLoading: isLoadingPosition, refresh: refreshPosition } = useUserPosition(account?.address);
  const { alphaPrice, refresh: refreshAlphaPrice } = useAlphaPrice();
  const { balance: taoBalance, refetch: refreshTaoBalance } = useTaoBalance(account?.address);

  const refreshAll = useCallback(() => {
    refreshMarket();
    refreshPosition();
    refreshAlphaPrice();
    refreshTaoBalance();
  }, [refreshMarket, refreshPosition, refreshAlphaPrice, refreshTaoBalance]);

  const txProgress = useTransactionProgress(refreshAll);

  const marketData = marketDataRaw ? {
    totalDeposits: parseFloat(marketDataRaw.metrics.totalSupplyAssets),
    availableLiquidity: parseFloat(marketDataRaw.metrics.liquidity),
    supplyAPY: parseFloat(marketDataRaw.metrics.supplyAPY) * 100,
    borrowAPY: parseFloat(marketDataRaw.metrics.borrowAPY) * 100,
    utilization: parseFloat(marketDataRaw.metrics.utilizationRate) * 100,
    maxLTV: parseFloat(marketDataRaw.config.ltv) * 100,
    liquidationLTV: parseFloat(marketDataRaw.config.lltv) * 100,
  } : {
    totalDeposits: 0, availableLiquidity: 0, supplyAPY: 0, borrowAPY: 0,
    utilization: 0, maxLTV: 50, liquidationLTV: 75,
  };

  const userPositions = position ? {
    borrow: {
      collateral: parseFloat(position.collateralAlpha),
      loan: parseFloat(position.borrowAssets),
      hasActivePosition: parseFloat(position.borrowAssets) > 0,
    },
    earn: {
      deposit: parseFloat(position.supplyAssets),
      hasActivePosition: parseFloat(position.supplyAssets) > 0,
    },
  } : {
    borrow: { collateral: 0, loan: 0, hasActivePosition: false },
    earn: { deposit: 0, hasActivePosition: false },
  };

  const totalCollateral = userPositions.borrow.collateral + (parseFloat(collateralAmount) || 0);
  const currentBorrow = userPositions.borrow.loan;
  const newBorrowAmount = parseFloat(borrowAmount) || 0;
  const totalBorrow = currentBorrow + newBorrowAmount;
  const maxBorrowPower = calculateMaxBorrow(totalCollateral, alphaPrice, marketData.maxLTV / 100);
  const availableToBorrow = Math.max(0, maxBorrowPower - currentBorrow);
  const healthFactor = calculateHealthFactor(totalCollateral, totalBorrow, alphaPrice, marketData.liquidationLTV / 100);
  const currentLTV = totalCollateral > 0 ? (totalBorrow / (totalCollateral * alphaPrice)) * 100 : 0;

  const newCollateralMaxBorrow = calculateMaxBorrow(
    parseFloat(collateralAmount) || 0, alphaPrice, marketData.maxLTV / 100
  );
  const isBorrowExceedingMax = newBorrowAmount > newCollateralMaxBorrow;

  const outstandingDebt = rawMarketState && position
    ? calculateOutstandingDebt(position.borrowShares, rawMarketState)
    : 0;
  const isRepayExceedingDebt = parseFloat(repayAmount) > outstandingDebt;
  const isWithdrawCollateralExceeding = parseFloat(withdrawCollateralAmount) > userPositions.borrow.collateral;

  const repayBreakdown = rawMarketState && position && (parseFloat(repayAmount) || 0) > 0
    ? getRepayBreakdown(position.borrowShares, parseFloat(repayAmount) || 0, rawMarketState)
    : null;

  const withdrawBreakdown = rawMarketState && position && (parseFloat(withdrawAmount) || 0) > 0
    ? getWithdrawBreakdown(position.supplyShares, parseFloat(withdrawAmount) || 0, rawMarketState)
    : null;

  const repayAndWithdrawHealthFactor = (() => {
    const repayNum = parseFloat(repayAmount) || 0;
    const remainingDebt = Math.max(0, outstandingDebt - repayNum);
    const remainingCollateral = Math.max(0, userPositions.borrow.collateral - (parseFloat(withdrawCollateralAmount) || 0));
    // Full repay: if repaying >= outstanding debt, position is fully closed — always safe
    if (remainingDebt < 0.0001 || repayNum >= outstandingDebt) return Infinity;
    return calculateHealthFactor(remainingCollateral, remainingDebt, alphaPrice, marketData.liquidationLTV / 100);
  })();
  const isRepayWithdrawUnsafe = repayAndWithdrawHealthFactor < 1.0 && repayAndWithdrawHealthFactor !== Infinity;

  const handleDeposit = async () => {
    if (!account?.address) { setTxError('Wallet not connected'); return; }
    if (!depositAmount || parseFloat(depositAmount) <= 0) { setTxError('Please enter a valid amount'); return; }
    const stateNum = marketDataRaw?.stateNumber ?? 0;
    const { onStatusUpdate, onError } = txProgress.startTransaction('deposit', stateNum);
    setIsTransacting(true); setTxError(null); setTxStatus('');
    try {
      await executeDeposit(account.address, depositAmount, onStatusUpdate);
      setTxStatus(''); setDepositAmount('');
    } catch (error: any) {
      onError(error.message || 'Deposit failed');
      setTxError(error.message || 'Deposit failed');
    } finally { setIsTransacting(false); refreshAll(); }
  };

  const handleWithdraw = async () => {
    if (!account?.address) { setTxError('Wallet not connected'); return; }
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) { setTxError('Please enter a valid amount'); return; }
    const stateNum = marketDataRaw?.stateNumber ?? 0;
    const { onStatusUpdate, onError } = txProgress.startTransaction('withdraw', stateNum);
    setIsTransacting(true); setTxError(null); setTxStatus('');
    try {
      await executeWithdraw(account.address, withdrawAmount, onStatusUpdate);
      setTxStatus(''); setWithdrawAmount('');
    } catch (error: any) {
      onError(error.message || 'Withdraw failed');
      setTxError(error.message || 'Withdraw failed');
    } finally { setIsTransacting(false); refreshAll(); }
  };

  const handleBorrow = async () => {
    if (!account?.address) { setTxError('Wallet not connected'); return; }
    if (!collateralAmount || parseFloat(collateralAmount) <= 0) { setTxError('Please enter collateral amount'); return; }
    if (!borrowAmount || parseFloat(borrowAmount) <= 0) { setTxError('Please enter borrow amount'); return; }
    const stateNum = marketDataRaw?.stateNumber ?? 0;
    const { onStatusUpdate, onError } = txProgress.startTransaction('deposit-and-borrow', stateNum);
    setIsTransacting(true); setTxError(null); setTxStatus('');
    try {
      await executeDepositAndBorrow(
        account.address, collateralAmount, borrowAmount,
        import.meta.env.VITE_SUBNET_ID || '44',
        alphaPrice, marketData.maxLTV / 100, marketData.liquidationLTV / 100,
        onStatusUpdate
      );
      setTxStatus(''); setCollateralAmount(''); setBorrowAmount('');
    } catch (error: any) {
      onError(error.message || 'Borrow failed');
      setTxError(error.message || 'Borrow failed');
    } finally { setIsTransacting(false); refreshAll(); }
  };

  const handleRepay = async () => {
    if (!account?.address) { setTxError('Wallet not connected'); return; }
    if (!repayAmount || parseFloat(repayAmount) <= 0) { setTxError('Please enter repay amount'); return; }
    if (isRepayExceedingDebt) { setTxError('Exceeds outstanding debt'); return; }
    if (isWithdrawCollateralExceeding) { setTxError('Exceeds your collateral'); return; }
    if (isRepayWithdrawUnsafe) { setTxError('Position would be liquidatable'); return; }
    const wantsCollateral = parseFloat(withdrawCollateralAmount) > 0;
    const actionType = wantsCollateral ? 'repay-and-withdraw' as const : 'repay' as const;
    const stateNum = marketDataRaw?.stateNumber ?? 0;
    const { onStatusUpdate, onError } = txProgress.startTransaction(actionType, stateNum);
    setIsTransacting(true); setTxError(null); setTxStatus('');
    try {
      if (wantsCollateral) {
        await executeRepayAndWithdrawCollateral(
          account.address, repayAmount, withdrawCollateralAmount,
          userPositions.borrow.collateral.toString(), onStatusUpdate
        );
      } else {
        await executeRepay(account.address, repayAmount, onStatusUpdate);
      }
      setTxStatus(''); setRepayAmount(''); setWithdrawCollateralAmount('');
    } catch (error: any) {
      onError(error.message || 'Repay failed');
      setTxError(error.message || 'Repay failed');
    } finally { setIsTransacting(false); refreshAll(); }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: 'linear-gradient(180deg, #E8E4FF 0%, #EDE9FF 20%, #F0EEFF 40%, #EEF0FF 60%, #D6E2FF 100%)',
    }}>
      <Navbar
        account={account}
        accounts={accounts}
        isConnecting={isConnecting}
        isConnected={isConnected}
        connectWallet={connectWallet}
        disconnectWallet={disconnectWallet}
        selectAccount={selectAccount}
        taoBalance={taoBalance}
      />

      <main className="flex-1 w-full" style={{ maxWidth: '1400px', margin: '0 auto', padding: '100px 48px 0' }}>
        {/* Hero header */}
        <div className="glass-card" style={{
          padding: '36px 40px',
          marginBottom: '16px',
          background: 'linear-gradient(to right, oklch(0.95 0.04 76), oklch(0.95 0.02 248))',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-40px', right: '-20px',
            width: '200px', height: '200px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,59,249,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#3B3BF9', boxShadow: '0 0 8px rgba(59,59,249,0.4)',
              }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#3B3BF9', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Live Market
              </span>
            </div>
            <h1 style={{
              fontFamily: 'Chillax Variable, Chillax',
              color: '#1A1A3E',
              fontSize: '30px',
              fontWeight: 600,
              marginBottom: '10px',
            }}>
              TAO Lending Market
            </h1>
            <p style={{ color: '#6B6B8D', fontSize: '15px', lineHeight: '1.6', maxWidth: '520px' }}>
              Earn yield by supplying TAO or leverage your Subnet Alpha tokens to borrow against them.
            </p>
          </div>
        </div>

        {/* Market stats */}
        <div style={{ marginBottom: '16px' }}>
          <MarketStats
            totalDeposits={marketData.totalDeposits}
            availableLiquidity={marketData.availableLiquidity}
            supplyAPY={marketData.supplyAPY}
            borrowAPY={marketData.borrowAPY}
            utilization={marketData.utilization}
            maxLTV={marketData.maxLTV}
            liquidationLTV={marketData.liquidationLTV}
            alphaPrice={alphaPrice}
            isLoading={isLoadingMarket}
            error={marketError}
          />
        </div>

        {/* User position - inline row */}
        <div style={{ marginBottom: '16px' }}>
          <UserPosition
            supplyAssets={userPositions.earn.deposit}
            borrowAssets={userPositions.borrow.loan}
            collateral={userPositions.borrow.collateral}
            healthFactor={healthFactor}
            supplyAPY={marketData.supplyAPY}
            borrowAPY={marketData.borrowAPY}
            alphaPrice={alphaPrice}
            isConnected={isConnected}
          />
        </div>

        {/* Two column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '16px', alignItems: 'start' }}>
          {/* Left column */}
          <div>
            <InterestRateChart
              utilization={marketData.utilization}
              borrowAPY={marketData.borrowAPY}
              supplyAPY={marketData.supplyAPY}
            />
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tab switcher */}
            <div className="glass-card" style={{ display: 'flex', borderRadius: '9999px', padding: '5px' }}>
              <button
                onClick={() => { setActiveTab('earn'); setTxError(null); setTxStatus(''); }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '9999px',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  ...(activeTab === 'earn'
                    ? { background: '#3B3BF9', color: '#fff', boxShadow: '0 4px 14px rgba(59,59,249,0.3)' }
                    : { background: 'transparent', color: '#6B6B8D' }
                  ),
                }}
              >
                Earn
              </button>
              <button
                onClick={() => { setActiveTab('borrow'); setTxError(null); setTxStatus(''); }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '9999px',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  ...(activeTab === 'borrow'
                    ? { background: '#3B3BF9', color: '#fff', boxShadow: '0 4px 14px rgba(59,59,249,0.3)' }
                    : { background: 'transparent', color: '#6B6B8D' }
                  ),
                }}
              >
                Borrow
              </button>
            </div>

            {/* Active panel */}
            {activeTab === 'earn' ? (
              <EarnPanel
                depositAmount={depositAmount}
                setDepositAmount={setDepositAmount}
                withdrawAmount={withdrawAmount}
                setWithdrawAmount={setWithdrawAmount}
                supplyAPY={marketData.supplyAPY}
                userDeposit={userPositions.earn.deposit}
                taoBalance={taoBalance}
                withdrawBreakdown={withdrawBreakdown}
                isConnected={isConnected}
                isConnecting={isConnecting}
                isTransacting={isTransacting}
                txStatus={txStatus}
                txError={txError}
                onDeposit={handleDeposit}
                onWithdraw={handleWithdraw}
                onConnect={connectWallet}
              />
            ) : (
              <BorrowPanel
                collateralAmount={collateralAmount}
                setCollateralAmount={setCollateralAmount}
                borrowAmount={borrowAmount}
                setBorrowAmount={setBorrowAmount}
                repayAmount={repayAmount}
                setRepayAmount={setRepayAmount}
                withdrawCollateralAmount={withdrawCollateralAmount}
                setWithdrawCollateralAmount={setWithdrawCollateralAmount}
                alphaPrice={alphaPrice}
                maxLTV={marketData.maxLTV}
                liquidationLTV={marketData.liquidationLTV}

                userCollateral={userPositions.borrow.collateral}
                userLoan={userPositions.borrow.loan}
                outstandingDebt={outstandingDebt}
                healthFactor={healthFactor}
                currentLTV={currentLTV}
                maxBorrowPower={maxBorrowPower}
                availableToBorrow={availableToBorrow}
                isBorrowExceedingMax={isBorrowExceedingMax}
                newCollateralMaxBorrow={newCollateralMaxBorrow}
                isRepayExceedingDebt={isRepayExceedingDebt}
                isWithdrawCollateralExceeding={isWithdrawCollateralExceeding}
                isRepayWithdrawUnsafe={isRepayWithdrawUnsafe}
                repayAndWithdrawHealthFactor={repayAndWithdrawHealthFactor}
                repayBreakdown={repayBreakdown}
                isConnected={isConnected}
                isConnecting={isConnecting}
                isTransacting={isTransacting}
                txStatus={txStatus}
                txError={txError}
                onBorrow={handleBorrow}
                onRepay={handleRepay}
                onConnect={connectWallet}
              />
            )}
          </div>
        </div>

        {/* Full-width protocol info bar */}
        <div style={{ marginTop: '32px' }}>
          <MarketInfo
            maxLTV={marketData.maxLTV}
            liquidationLTV={marketData.liquidationLTV}
            alphaPrice={alphaPrice}
          />
        </div>
      </main>

      <Footer />

      <TransactionProgress
        steps={txProgress.steps}
        isActive={txProgress.isActive}
        canClose={txProgress.canClose}
        errorMessage={txProgress.errorMessage}
        onClose={txProgress.close}
      />
    </div>
  );
}
