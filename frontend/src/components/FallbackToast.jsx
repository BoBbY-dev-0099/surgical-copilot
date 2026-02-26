import { useNotice } from '../context/NoticeContext';
import './FallbackToast.css';

/**
 * Stacked toast notifications — renders in top-right corner.
 * Auto-dismisses after 8s (controlled by NoticeContext).
 */
export default function FallbackToast() {
    const { notices, dismissNotice } = useNotice();

    if (notices.length === 0) return null;

    return (
        <div className="fallback-toast-container" role="alert" aria-live="polite">
            {notices.map((n) => (
                <div key={n.id} className={`fallback-toast fallback-toast--${n.type}`}>
                    <div className="fallback-toast__header">
                        <span className="fallback-toast__icon">
                            {n.type === 'warning' ? '⚠️' : n.type === 'error' ? '❌' : 'ℹ️'}
                        </span>
                        <strong className="fallback-toast__title">{n.title}</strong>
                        <button
                            className="fallback-toast__close"
                            onClick={() => dismissNotice(n.id)}
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                    {n.message && <p className="fallback-toast__message">{n.message}</p>}
                    {n.requestId && (
                        <p className="fallback-toast__rid">
                            Request ID: <code>{n.requestId}</code>
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
