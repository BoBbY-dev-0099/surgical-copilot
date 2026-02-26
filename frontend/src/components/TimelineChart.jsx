import { useState, useMemo } from 'react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend,
} from 'recharts';

/**
 * Timeline chart with metric toggle.
 *
 * Props:
 *  - data: array of { day, ...metrics }
 *  - metrics: array of { key, label, color } OR array of strings (e.g., ['pain', 'temp'])
 *  - xKey: string (default 'day')
 *  - title: string (optional)
 */

const DEFAULT_COLORS = ['#14B8A6', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

const METRIC_LABELS = {
    pain: 'Pain Score',
    temp: 'Temperature (°C)',
    wbc: 'WBC (K/µL)',
    crp: 'CRP (mg/L)',
    hr: 'Heart Rate',
    bp: 'Blood Pressure',
    spo2: 'SpO2 (%)',
    lactate: 'Lactate',
    nausea: 'Nausea',
    fatigue: 'Fatigue',
};

export default function TimelineChart({ data, metrics, xKey = 'day', title }) {
    const normalizedMetrics = useMemo(() => {
        if (!metrics || metrics.length === 0) return [];
        if (typeof metrics[0] === 'string') {
            return metrics.map((key, i) => ({
                key,
                label: METRIC_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1),
                color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
            }));
        }
        return metrics;
    }, [metrics]);

    const [activeMetrics, setActiveMetrics] = useState(
        () => new Set(normalizedMetrics.slice(0, 2).map(m => m.key))
    );

    const toggleMetric = (key) => {
        setActiveMetrics(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                if (next.size > 1) next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    if (!data || data.length === 0 || normalizedMetrics.length === 0) {
        return (
            <div className="chart-empty">No timeline data available</div>
        );
    }

    return (
        <div className="timeline-chart">
            {title && <div className="chart-title">{title}</div>}

            {/* Metric toggles */}
            <div className="metric-toggles">
                {normalizedMetrics.map((m, i) => (
                    <button
                        key={m.key}
                        className={`metric-toggle ${activeMetrics.has(m.key) ? 'active' : ''}`}
                        style={activeMetrics.has(m.key) ? {
                            borderColor: m.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                            color: m.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                        } : {}}
                        onClick={() => toggleMetric(m.key)}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                        dataKey={xKey}
                        tick={{ fontSize: 11 }}
                        label={{ value: xKey === 'day' ? 'Day' : xKey, position: 'insideBottomRight', offset: -5, fontSize: 11 }}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {normalizedMetrics.map((m, i) => (
                        activeMetrics.has(m.key) && (
                            <Line
                                key={m.key}
                                type="monotone"
                                dataKey={m.key}
                                name={m.label}
                                stroke={m.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                                connectNulls
                            />
                        )
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
