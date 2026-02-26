import { useState, useEffect } from 'react';
import { v1Api } from '../api/v1Api';

export default function NotificationFeed() {
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        // Initial fetch
        v1Api.getNotifications().then(setNotifications);

        // Subscribe to SSE
        const unsubscribe = v1Api.subscribeToAlerts((msg) => {
            setNotifications(prev => [
                {
                    id: msg.checkin_id,
                    patient_name: msg.patient_name,
                    risk_level: msg.risk_level,
                    message: msg.message,
                    created_at: msg.created_at,
                    is_new: true
                },
                ...prev
            ].slice(0, 50));
        });

        return unsubscribe;
    }, []);

    const handleRead = async (id) => {
        await v1Api.markNotificationRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_new: false } : n));
    };

    return (
        <div className="notification-feed">
            <div className="feed-header">
                <span className="feed-title">Real-time Feed</span>
                <span className="feed-dot" />
            </div>
            <div className="feed-list">
                {notifications.length === 0 && (
                    <div className="feed-empty">No active alerts</div>
                )}
                {notifications.map((n, i) => (
                    <div
                        key={n.id || i}
                        className={`feed-item risk-${n.risk_level} ${n.is_new ? 'new' : ''}`}
                        onClick={() => handleRead(n.id)}
                    >
                        <div className="feed-item-top">
                            <span className="feed-patient">{n.patient_name}</span>
                            <span className="feed-time">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="feed-msg">{n.message}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
