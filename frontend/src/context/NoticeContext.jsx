import { createContext, useContext, useState, useCallback } from 'react';

/**
 * Global Notice System — lets any component push a notification toast.
 *
 * Usage:
 *   const { pushNotice } = useNotice();
 *   pushNotice({ type: 'warning', title: '...', message: '...', requestId: '...' });
 */

const NoticeContext = createContext(null);

let _noticeId = 0;

export function NoticeProvider({ children }) {
    const [notices, setNotices] = useState([]);

    const pushNotice = useCallback(({ type = 'info', title, message, requestId }) => {
        const id = ++_noticeId;
        setNotices((prev) => [...prev, { id, type, title, message, requestId, createdAt: Date.now() }]);

        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            setNotices((prev) => prev.filter((n) => n.id !== id));
        }, 8000);
    }, []);

    const dismissNotice = useCallback((id) => {
        setNotices((prev) => prev.filter((n) => n.id !== id));
    }, []);

    return (
        <NoticeContext.Provider value={{ notices, pushNotice, dismissNotice }}>
            {children}
        </NoticeContext.Provider>
    );
}

/**
 * @returns {{ notices: Array, pushNotice: Function, dismissNotice: Function }}
 */
export function useNotice() {
    const ctx = useContext(NoticeContext);
    if (!ctx) throw new Error('useNotice must be used within <NoticeProvider>');
    return ctx;
}
