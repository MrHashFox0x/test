import { useState, useCallback, useRef } from 'react';
import { fetchProtocolState } from '../utils/fetchState';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface TxStep {
  id: string;
  label: string;
  status: StepStatus;
  description?: string;
}

export type TxActionType = 'deposit' | 'withdraw' | 'deposit-and-borrow' | 'repay' | 'repay-and-withdraw';

const POLLING_INTERVAL = 3000;
const TIMEOUT = 5 * 60 * 1000; // 5 minutes before showing "scanner may be offline"

async function fetchStateNumber(): Promise<number | null> {
  try {
    const data = await fetchProtocolState();
    return data.stateNumber ?? null;
  } catch {
    return null;
  }
}

function buildSteps(actionType: TxActionType): TxStep[] {
  const base: TxStep[] = [
    { id: 'prepare', label: 'Preparing Transaction', status: 'pending' },
    { id: 'sign', label: 'Waiting for Signature', status: 'pending' },
    { id: 'in-block', label: 'Submitted to Network', status: 'pending' },
    { id: 'finalized', label: 'Transaction Finalized', status: 'pending' },
  ];

  switch (actionType) {
    case 'deposit':
      base.push({ id: 'confirm-1', label: 'Confirming Deposit', status: 'pending' });
      break;
    case 'withdraw':
      base.push({ id: 'confirm-1', label: 'Confirming Withdrawal', status: 'pending' });
      break;
    case 'deposit-and-borrow':
      base.push({ id: 'confirm-1', label: 'Confirming Collateral Deposit', status: 'pending' });
      base.push({ id: 'confirm-2', label: 'Confirming Borrow', status: 'pending' });
      break;
    case 'repay':
      base.push({ id: 'confirm-1', label: 'Confirming Repay', status: 'pending' });
      break;
    case 'repay-and-withdraw':
      base.push({ id: 'confirm-1', label: 'Confirming Repay', status: 'pending' });
      base.push({ id: 'confirm-2', label: 'Confirming Collateral Withdrawal', status: 'pending' });
      break;
  }

  return base;
}

function getExpectedIncrements(actionType: TxActionType): number {
  switch (actionType) {
    case 'deposit-and-borrow':
    case 'repay-and-withdraw':
      return 2;
    default:
      return 1;
  }
}

export function useTransactionProgress(onComplete?: () => void) {
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [actionType, setActionType] = useState<TxActionType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const updateStep = useCallback((stepId: string, status: StepStatus, description?: string) => {
    setSteps(prev => prev.map(step =>
      step.id === stepId ? { ...step, status, description: description ?? step.description } : step
    ));
  }, []);

  const startTransaction = useCallback((type: TxActionType, currentStateNumber: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const newSteps = buildSteps(type);
    newSteps[0].status = 'active';
    setSteps(newSteps);
    setIsActive(true);
    setCanClose(false);
    setActionType(type);
    setErrorMessage(null);

    const expectedIncrements = getExpectedIncrements(type);

    // Return callbacks for the transaction handler
    const onStatusUpdate = (status: string) => {
      if (controller.signal.aborted) return;

      if (status.includes('Connecting') || status.includes('Preparing') || status.includes('Validating')) {
        setSteps(prev => prev.map(s =>
          s.id === 'prepare' ? { ...s, status: 'active', description: status } : s
        ));
      } else if (status.includes('signature')) {
        setSteps(prev => prev.map(s => {
          if (s.id === 'prepare') return { ...s, status: 'done' };
          if (s.id === 'sign') return { ...s, status: 'active' };
          return s;
        }));
      } else if (status.includes('in block')) {
        setSteps(prev => prev.map(s => {
          if (s.id === 'prepare' || s.id === 'sign') return { ...s, status: 'done' };
          if (s.id === 'in-block') return { ...s, status: 'active' };
          return s;
        }));
      } else if (status.includes('finalized') || status.includes('Finalized')) {
        setSteps(prev => prev.map(s => {
          if (s.id === 'prepare' || s.id === 'sign' || s.id === 'in-block') return { ...s, status: 'done' };
          if (s.id === 'finalized') return { ...s, status: 'done' };
          if (s.id === 'confirm-1') return { ...s, status: 'active' };
          return s;
        }));

        // Start polling for protocol confirmations
        let confirmedCount = 0;
        const startTime = Date.now();

        const poll = () => {
          if (controller.signal.aborted) return;

          if (Date.now() - startTime > TIMEOUT) {
            setErrorMessage('Processing is taking longer than expected. The scanner may be offline.');
            setCanClose(true);
            return;
          }

          fetchStateNumber().then((stateNumber) => {
            if (controller.signal.aborted) return;
            if (stateNumber === null) {
              setTimeout(poll, POLLING_INTERVAL);
              return;
            }

            const incrementsSoFar = stateNumber - currentStateNumber;

            if (incrementsSoFar >= 1 && confirmedCount === 0) {
              confirmedCount = 1;
              setSteps(prev => prev.map(s => {
                if (s.id === 'confirm-1') return { ...s, status: 'done' };
                if (s.id === 'confirm-2') return { ...s, status: 'active' };
                return s;
              }));

              if (expectedIncrements === 1) {
                setCanClose(true);
                onCompleteRef.current?.();
                return;
              }
            }

            if (incrementsSoFar >= 2 && confirmedCount === 1 && expectedIncrements >= 2) {
              confirmedCount = 2;
              setSteps(prev => prev.map(s => {
                if (s.id === 'confirm-2') return { ...s, status: 'done' };
                return s;
              }));
              setCanClose(true);
              onCompleteRef.current?.();
              return;
            }

            if (confirmedCount < expectedIncrements) {
              setTimeout(poll, POLLING_INTERVAL);
            }
          });
        };

        setTimeout(poll, POLLING_INTERVAL);
      }
    };

    const onError = (error: string) => {
      setErrorMessage(error);
      setSteps(prev => {
        const updated = [...prev];
        const activeIdx = updated.findIndex(s => s.status === 'active');
        if (activeIdx >= 0) {
          updated[activeIdx] = { ...updated[activeIdx], status: 'error' };
        }
        return updated;
      });
      setCanClose(true);
    };

    return { onStatusUpdate, onError };
  }, []);

  const close = useCallback(() => {
    if (!canClose) return;
    abortRef.current?.abort();
    setIsActive(false);
    setSteps([]);
    setActionType(null);
    setErrorMessage(null);
    setCanClose(false);
  }, [canClose]);

  return {
    steps,
    isActive,
    canClose,
    actionType,
    errorMessage,
    startTransaction,
    updateStep,
    close,
  };
}
