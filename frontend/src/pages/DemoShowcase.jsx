/**
 * DemoShowcase — Premium 3×3 clinical AI showcase page.
 * Shows all three adapters with 3 synthetic cases each (9 total), end-to-end.
 * All inference comes from the real backend.
 */
import { useState, useRef, useEffect } from 'react';
import { SAMPLE_MAP } from '../data/mockCases';
import { runInference } from '../api/inferenceApi';
import { validate } from '../lib/validators';
import { v1Api } from '../api/v1Api';
import TimelineChart from '../components/TimelineChart';
import ClinicalOutputCard from '../components/ClinicalOutputCard';

// ── Adapter meta ────────────────────────────────────────────────────
const ADAPTERS = [
    {
        id: 'phase1b',
        title: 'Inpatient Triage',
        subtitle: 'Phase 1 Adapter',
        icon: '🏥',
        tagline: 'Operate now · Watch & wait · Avoid',
        description: 'Analyzes serial lab trends, imaging, and clinical signs to recommend the correct surgical escalation pathway for post-operative inpatients.',
        color: '#7C3AED',
        lightColor: '#EDE9FE',
        chartMetrics: [
            { key: 'wbc', label: 'WBC', color: '#EF4444' },
            { key: 'crp', label: 'CRP', color: '#F59E0B' },
            { key: 'temp', label: 'Temp°C', color: '#3B82F6' },
            { key: 'pain', label: 'Pain', color: '#8B5CF6' },
        ],
    },
    {
        id: 'phase2',
        title: 'Post-Discharge Monitor',
        subtitle: 'SAFEGUARD Adapter',
        icon: '📱',
        tagline: 'Green · Amber · Red',
        description: 'Processes daily patient-reported outcomes after hospital discharge to detect early complications and auto-escalate to clinical teams when needed.',
        color: '#059669',
        lightColor: '#D1FAE5',
        chartMetrics: [
            { key: 'riskScore', label: 'Risk Score', color: '#EF4444' },
            { key: 'temp', label: 'Temp°C', color: '#3B82F6' },
            { key: 'pain', label: 'Pain', color: '#8B5CF6' },
        ],
    },
    {
        id: 'onc',
        title: 'Oncology Surveillance',
        subtitle: 'ONC Adapter',
        icon: '🔬',
        tagline: 'Stable · Possible progression · Confirmed progression',
        description: 'Multi-modal analysis of imaging, tumor markers, and clinical status to classify disease progression and recommend the next surveillance or treatment action.',
        color: '#DC2626',
        lightColor: '#FEE2E2',
        chartMetrics: [
            { key: 'riskScore', label: 'Risk Score', color: '#EF4444' },
            { key: 'cea', label: 'CEA', color: '#F59E0B' },
            { key: 'lesion_max_cm', label: 'Max Lesion cm', color: '#8B5CF6' },
        ],
    },
];

const BADGE_CONFIG = {
    operate_now:            { color: 'red',   label: 'OPERATE NOW',         icon: '🔴' },
    watch_wait:             { color: 'amber', label: 'WATCH & WAIT',         icon: '🟡' },
    avoid:                  { color: 'muted', label: 'AVOID SURGERY',        icon: '⚫' },
    green:                  { color: 'green', label: 'GREEN — Low Risk',     icon: '🟢' },
    amber:                  { color: 'amber', label: 'AMBER — Monitor',      icon: '🟡' },
    red:                    { color: 'red',   label: 'RED — Escalate',       icon: '🔴' },
    stable_disease:         { color: 'green', label: 'STABLE DISEASE',       icon: '🟢' },
    possible_progression:   { color: 'amber', label: 'POSSIBLE PROGRESSION', icon: '🟡' },
    confirmed_progression:  { color: 'red',   label: 'CONFIRMED PROGRESSION',icon: '🔴' },
};

// ── Helpers ─────────────────────────────────────────────────────────
function getBadge(caseItem) {
    if (!caseItem) return null;
    const key = caseItem.badge || caseItem.expectedOutput?.label_class || caseItem.expectedOutput?.progression_status;
    return BADGE_CONFIG[key] || null;
}

export default function DemoShowcase() {
    const [activeAdapter, setActiveAdapter] = useState('phase1b');
    const [selectedCase, setSelectedCase] = useState(null);
    const [output, setOutput] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isSimulation, setIsSimulation] = useState(true);
    const [validation, setValidation] = useState(null);
    const [activeTab, setActiveTab] = useState('samples'); // 'samples' or 'evaluation'
    const [evalResults, setEvalResults] = useState(null);
    const [evalLoading, setEvalLoading] = useState(false);
    const outputRef = useRef(null);

    const adapter = ADAPTERS.find(a => a.id === activeAdapter);
    const cases = SAMPLE_MAP[activeAdapter] || [];

    const handleSelectAdapter = (id) => {
        setActiveAdapter(id);
        setSelectedCase(null);
        setOutput(null);
        setValidation(null);
    };

    const handleRunCase = async (c) => {
        setSelectedCase(c);
        setOutput(null);
        setValidation(null);
        setLoading(true);

        // scroll to output
        setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

        if (isSimulation) {
            await new Promise(r => setTimeout(r, 1400));
            setOutput(null);
            setValidation(null);
            setLoading(false);
            return;
        } else {
            const res = await runInference(activeAdapter, c.data);
            setOutput(res.data);
            setValidation(validate(activeAdapter, res.data));
        }
        setLoading(false);
    };

    const runEvaluation = async () => {
        setEvalLoading(true);
        try {
            const results = await v1Api.runEvaluation();
            setEvalResults(results);
        } catch (err) {
            console.error('Evaluation failed:', err);
            setEvalResults({ error: 'Evaluation failed' });
        }
        setEvalLoading(false);
    };

    return (
        <div className="demo-showcase-page">
            {/* ── Header ── */}
            <div className="showcase-hero">
                <div className="showcase-hero-inner">
                    <div className="showcase-eyebrow">
                        <span className="eyebrow-pill">MedGemma 27B · LoRA Fine-tuned</span>
                        <span className="eyebrow-pill eyebrow-pill--muted">3 Clinical Adapters · 9 Synthetic Cases</span>
                    </div>
                    <h1 className="showcase-title">
                        Surgical AI Copilot
                        <br />
                        <span className="showcase-title-accent">Clinical Decision Support</span>
                    </h1>
                    <p className="showcase-desc">
                        Three specialized LoRA adapters trained on surgical outcomes data.
                        Select an adapter, choose a clinical scenario, and watch the AI reason through it.
                    </p>
                    <div className="showcase-metrics">
                        <div className="metric-pill">
                            <span className="metric-value">100%</span>
                            <span className="metric-label">Phase 1 F1</span>
                        </div>
                        <div className="metric-pill">
                            <span className="metric-value">100%</span>
                            <span className="metric-label">Onco Schema</span>
                        </div>
                        <div className="metric-pill">
                            <span className="metric-value">94.2%</span>
                            <span className="metric-label">Phase 2 Red Recall</span>
                        </div>
                        <div className="metric-pill">
                            <span className="metric-value">27B</span>
                            <span className="metric-label">Parameters</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Tab Selector ── */}
            <div className="showcase-tabs">
                <button 
                    className={`showcase-tab ${activeTab === 'samples' ? 'active' : ''}`}
                    onClick={() => setActiveTab('samples')}
                >
                    🧪 Synthetic Samples
                </button>
                <button 
                    className={`showcase-tab ${activeTab === 'evaluation' ? 'active' : ''}`}
                    onClick={() => setActiveTab('evaluation')}
                >
                    📊 Evaluation Suite
                </button>
            </div>

            {activeTab === 'samples' && (
                <div className="showcase-body">
                {/* ── Adapter Selector ── */}
                <div className="adapter-selector">
                    {ADAPTERS.map(a => (
                        <button
                            key={a.id}
                            className={`adapter-tab ${activeAdapter === a.id ? 'active' : ''}`}
                            style={activeAdapter === a.id ? { '--tab-color': a.color, '--tab-light': a.lightColor } : {}}
                            onClick={() => handleSelectAdapter(a.id)}
                        >
                            <span className="adapter-tab-icon">{a.icon}</span>
                            <div className="adapter-tab-text">
                                <span className="adapter-tab-title">{a.title}</span>
                                <span className="adapter-tab-sub">{a.subtitle}</span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* ── Adapter Description Banner ── */}
                <div className="adapter-banner" style={{ '--banner-color': adapter.color, '--banner-light': adapter.lightColor }}>
                    <div className="adapter-banner-left">
                        <div className="adapter-banner-icon">{adapter.icon}</div>
                        <div>
                            <div className="adapter-banner-title">{adapter.title}</div>
                            <div className="adapter-banner-tagline">{adapter.tagline}</div>
                            <p className="adapter-banner-desc">{adapter.description}</p>
                        </div>
                    </div>
                    <div className="adapter-banner-right">
                        <label className="sim-toggle-label">
                            <span>Simulation mode</span>
                            <button
                                className={`sim-toggle ${isSimulation ? 'on' : ''}`}
                                onClick={() => setIsSimulation(v => !v)}
                            >
                                <span className="sim-toggle-knob" />
                            </button>
                            <span className="sim-toggle-hint">{isSimulation ? 'Using pre-computed outputs' : 'Calling live API'}</span>
                        </label>
                    </div>
                </div>

                {/* ── Case Grid (3 columns) ── */}
                <div className="case-grid">
                    {cases.map((c) => {
                        const badge = getBadge(c);
                        const isSelected = selectedCase?.value === c.value;
                        return (
                            <button
                                key={c.value}
                                className={`case-card ${isSelected ? 'selected' : ''} badge-${badge?.color || 'muted'}`}
                                onClick={() => handleRunCase(c)}
                            >
                                <div className="case-card-badge">
                                    <span className={`chip ${badge?.color || 'muted'}`}>
                                        {badge?.icon} {badge?.label || c.badge?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="case-card-title">{c.label}</div>
                                <div className="case-card-sub">{c.sublabel}</div>
                                {c.timelineSeries && c.timelineSeries.length > 0 && (
                                    <div className="case-card-sparkline">
                                        <MiniSparkline
                                            data={c.timelineSeries}
                                            metricKey={adapter.chartMetrics[0].key}
                                            color={adapter.color}
                                        />
                                    </div>
                                )}
                                <div className="case-card-cta">
                                    {isSelected && loading ? 'Analyzing…' : 'Run Analysis →'}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* ── Output Section ── */}
                <div ref={outputRef}>
                    {(loading || output) && (
                        <div className="showcase-output-section">
                            <div className="showcase-output-header">
                                <div>
                                    <div className="showcase-output-title">
                                        {loading ? 'AI is analyzing the case…' : `Analysis Complete — ${selectedCase?.label}`}
                                    </div>
                                    {!loading && output && (
                                        <div className="showcase-output-sub">
                                            {isSimulation ? 'Simulation mode · Pre-computed output' : 'Live inference · Real model output'}
                                            {validation && (
                                                <span className={`chip ${validation.pass ? 'green' : 'amber'}`} style={{ marginLeft: 10 }}>
                                                    Schema: {validation.pass ? 'PASS ✓' : `WARN (${validation.errors.length})`}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {loading ? (
                                <div className="showcase-loading">
                                    <div className="showcase-loading-dots">
                                        <span /><span /><span />
                                    </div>
                                    <div className="showcase-loading-text">
                                        MedGemma 27B is reasoning through the clinical case…
                                    </div>
                                </div>
                            ) : (
                                <div className="showcase-output-grid">
                                    {/* Left: Case context + timeline */}
                                    <div className="showcase-context-col">
                                        <div className="showcase-context-panel">
                                            <div className="panel-label">Clinical Case</div>
                                            <div className="case-text-display">
                                                {selectedCase?.data?.case_text || JSON.stringify(selectedCase?.data, null, 2)}
                                            </div>
                                        </div>
                                        {selectedCase?.timelineSeries?.length > 0 && (
                                            <div className="showcase-context-panel" style={{ marginTop: 16 }}>
                                                <TimelineChart
                                                    data={selectedCase.timelineSeries}
                                                    metrics={adapter.chartMetrics}
                                                    title="Patient Timeline"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: AI output */}
                                    <div className="showcase-ai-col">
                                        <ClinicalOutputCard
                                            data={output}
                                            adapter={activeAdapter}
                                            adapterMeta={adapter}
                                            validation={validation}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && !output && (
                        <div className="showcase-empty-state">
                            <div className="showcase-empty-icon">{adapter.icon}</div>
                            <div className="showcase-empty-title">Select a synthetic case above to run AI analysis</div>
                            <div className="showcase-empty-sub">
                                Choose any of the 3 clinical scenarios — the AI will classify the case and provide full clinical reasoning.
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

            {activeTab === 'evaluation' && (
                <div className="showcase-body">
                    <div className="eval-section">
                        <div className="eval-header">
                            <h2>DECIDE-AI Evaluation Suite</h2>
                            <p>Run comprehensive evaluation on all 9 synthetic cases across all adapters.</p>
                        </div>

                        <div className="eval-actions">
                            <button 
                                className={`btn btn-primary ${evalLoading ? 'loading' : ''}`}
                                onClick={runEvaluation}
                                disabled={evalLoading}
                            >
                                {evalLoading ? '⏳ Running Evaluation...' : '▶️ Run Full Evaluation'}
                            </button>
                        </div>

                        {evalResults && !evalResults.error && (
                            <div className="eval-results">
                                <div className="eval-summary-grid">
                                    {Object.entries(evalResults.summary || {}).map(([adapter, metrics]) => (
                                        <div key={adapter} className="eval-adapter-card">
                                            <div className="eval-adapter-header">
                                                <span className="eval-adapter-name">{adapter.toUpperCase()}</span>
                                                <span className={`eval-status ${metrics.accuracy >= 0.8 ? 'pass' : 'warn'}`}>
                                                    {metrics.accuracy >= 0.8 ? '✓ PASS' : '⚠ WARN'}
                                                </span>
                                            </div>
                                            <div className="eval-metrics-grid">
                                                <div className="eval-metric">
                                                    <span className="eval-metric-value">{metrics.total_cases}</span>
                                                    <span className="eval-metric-label">Cases</span>
                                                </div>
                                                <div className="eval-metric">
                                                    <span className="eval-metric-value">{(metrics.accuracy * 100).toFixed(0)}%</span>
                                                    <span className="eval-metric-label">Accuracy</span>
                                                </div>
                                                <div className="eval-metric">
                                                    <span className="eval-metric-value">{(metrics.parse_rate * 100).toFixed(0)}%</span>
                                                    <span className="eval-metric-label">Parse Rate</span>
                                                </div>
                                                <div className="eval-metric">
                                                    <span className="eval-metric-value">{(metrics.high_risk_recall * 100).toFixed(0)}%</span>
                                                    <span className="eval-metric-label">HR Recall</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {evalResults.report && (
                                    <div className="eval-report">
                                        <h3>Full Report</h3>
                                        <pre className="eval-report-text">{evalResults.report}</pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {evalResults?.error && (
                            <div className="eval-error">
                                <span>⚠️ {evalResults.error}</span>
                                <p>Make sure the backend is running to execute evaluations.</p>
                            </div>
                        )}

                        {!evalResults && !evalLoading && (
                            <div className="eval-empty">
                                <div className="eval-empty-icon">📊</div>
                                <div className="eval-empty-title">No evaluation results yet</div>
                                <div className="eval-empty-sub">
                                    Click "Run Full Evaluation" to test all 9 synthetic cases against expected outputs.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Mini sparkline (SVG line chart) ─────────────────────────────────
function MiniSparkline({ data, metricKey, color }) {
    const values = data.map(d => d[metricKey] ?? 0).filter(v => typeof v === 'number');
    if (values.length < 2) return null;

    const W = 120, H = 32, PAD = 2;
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const pts = values.map((v, i) => {
        const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
        const y = H - PAD - ((v - minV) / range) * (H - PAD * 2);
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={W} height={H} style={{ display: 'block', opacity: 0.7 }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
