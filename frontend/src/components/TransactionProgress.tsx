import type { TxStep } from '../hooks/useTransactionProgress';
import Loadable from './Loadable';

interface TransactionProgressProps {
  steps: TxStep[];
  isActive: boolean;
  canClose: boolean;
  errorMessage: string | null;
  onClose: () => void;
}

function StepIcon({ status }: { status: TxStep['status'] }) {
  if (status === 'done') {
    return (
      <div style={{
        width: '22px', height: '22px', borderRadius: '50%',
        background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M3 7L6 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (status === 'active') {
    return (
      <div style={{
        width: '22px', height: '22px', borderRadius: '50%',
        background: '#3B3BF9', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse 2s infinite',
      }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{
        width: '22px', height: '22px', borderRadius: '50%',
        background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M4 4L10 10M10 4L4 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // pending
  return (
    <div style={{
      width: '22px', height: '22px', borderRadius: '50%',
      background: 'rgba(59,59,249,0.06)', border: '2px solid rgba(59,59,249,0.12)',
      flexShrink: 0,
    }} />
  );
}

function StepConnector({ done }: { done: boolean }) {
  return (
    <div style={{
      width: '2px', height: '14px', marginLeft: '10px',
      background: done ? '#059669' : 'rgba(59,59,249,0.1)',
      transition: 'background 0.3s',
    }} />
  );
}

export function TransactionProgress({ steps, isActive, canClose, errorMessage, onClose }: TransactionProgressProps) {
  if (!isActive) return null;

  const allDone = steps.every(s => s.status === 'done');
  const hasError = steps.some(s => s.status === 'error');
  const isProcessing = !allDone && !hasError;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(26, 26, 62, 0.5)',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        width: '440px',
        background: 'rgba(255,255,255,0.97)',
        borderRadius: '24px',
        border: '1.5px solid rgba(59,59,249,0.12)',
        boxShadow: '0 24px 80px rgba(59,59,249,0.15), 0 8px 32px rgba(0,0,0,0.08)',
        padding: '36px 32px',
        position: 'relative',
      }}>
        {/* Big centered loader / status icon */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginBottom: '28px',
        }}>
          {isProcessing && (
            <Loadable loading={true} loader="rings" size={100} value={null} />
          )}
          {allDone && (
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(5,150,105,0.3)',
            }}>
              <svg width="36" height="36" viewBox="0 0 14 14" fill="none">
                <path d="M3 7L6 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          {hasError && (
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(220,38,38,0.3)',
            }}>
              <svg width="36" height="36" viewBox="0 0 14 14" fill="none">
                <path d="M4 4L10 10M10 4L4 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          )}

          {/* Title + subtitle */}
          <div style={{
            fontSize: '20px', fontWeight: 700, color: '#1A1A3E',
            fontFamily: 'Chillax Variable, Chillax',
            marginTop: '16px', textAlign: 'center',
          }}>
            {allDone ? 'Transaction Complete' : hasError ? 'Transaction Failed' : 'Processing Transaction'}
          </div>
          <div style={{ fontSize: '13px', color: '#6B6B8D', marginTop: '6px', textAlign: 'center' }}>
            {allDone
              ? 'All actions have been confirmed by the protocol.'
              : hasError
                ? 'An error occurred during the transaction.'
                : 'Do not close this window.'}
          </div>
          {isProcessing && (
            <div style={{
              fontSize: '12px', color: '#9B9BB5', marginTop: '10px', textAlign: 'center',
              padding: '8px 12px', borderRadius: '10px', background: 'rgba(59,59,249,0.05)',
            }}>
              It may take up to 5 minutes for the protocol to process your transaction.
            </div>
          )}
        </div>
        <div style={{
          padding: '16px 18px',
          borderRadius: '14px',
          background: 'rgba(59,59,249,0.03)',
          border: '1px solid rgba(59,59,249,0.06)',
          marginBottom: '20px',
        }}>
          {steps.map((step, i) => (
            <div key={step.id}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                opacity: step.status === 'pending' ? 0.4 : 1,
                transition: 'opacity 0.3s',
              }}>
                <StepIcon status={step.status} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 600,
                    color: step.status === 'error' ? '#dc2626'
                      : step.status === 'done' ? '#059669'
                        : step.status === 'active' ? '#3B3BF9'
                          : '#9B9BB5',
                  }}>
                    {step.label}
                  </div>
                  {step.description && step.status === 'active' && (
                    <div style={{ fontSize: '11px', color: '#9B9BB5', marginTop: '1px' }}>
                      {step.description}
                    </div>
                  )}
                </div>
              </div>
              {i < steps.length - 1 && (
                <StepConnector done={step.status === 'done'} />
              )}
            </div>
          ))}
        </div>

        {/* Error message */}
        {errorMessage && (
          <div style={{
            padding: '12px 16px', borderRadius: '12px',
            background: '#fef2f2', border: '1px solid #fecaca',
            fontSize: '13px', color: '#dc2626', marginBottom: '16px',
            wordBreak: 'break-word',
          }}>
            {errorMessage}
          </div>
        )}

        {/* Close button */}
        {canClose && (
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '14px',
              borderRadius: '14px', border: 'none',
              fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
              background: allDone ? '#059669' : hasError ? '#dc2626' : '#3B3BF9',
              color: '#fff',
              boxShadow: allDone
                ? '0 4px 14px rgba(5,150,105,0.3)'
                : hasError
                  ? '0 4px 14px rgba(220,38,38,0.3)'
                  : '0 4px 14px rgba(59,59,249,0.3)',
            }}
          >
            {allDone ? 'Done' : 'Close'}
          </button>
        )}
      </div>
    </div>
  );
}
