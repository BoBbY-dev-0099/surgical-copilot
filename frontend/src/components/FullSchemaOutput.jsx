/**
 * FullSchemaOutput — Comprehensive display of all model output fields.
 * 
 * Shows every field from the training schema so we can verify
 * exactly what the model is outputting.
 */

import React, { useState } from 'react';
import {
    AlertTriangle, CheckCircle, XCircle, Activity,
    FileText, User, Clock, Target, TrendingUp, TrendingDown,
    Shield, Stethoscope, Microscope, Heart, Thermometer,
    AlertCircle, Info, ChevronDown, ChevronRight
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA DEFINITIONS — All fields from training scripts
// ═══════════════════════════════════════════════════════════════════════

const PHASE1B_SCHEMA = {
    primary: ['label_class', 'trajectory', 'red_flag_triggered', 'red_flags'],
    secondary: ['peritonitis', 'imaging_free_fluid', 'hb_drop', 'source_control'],
    agent: ['watch_parameters', 'reassess_in_hours', 'copilot_transfer', 'news2', 'sepsis_screen', 'structured_audit'],
};

const PHASE2_SCHEMA = {
    primary: ['doc_type', 'risk_level', 'risk_score', 'timeline_deviation', 'trajectory', 'trigger_reason'],
    secondary: ['domain_flags', 'patient_message', 'followup_questions', 'evidence'],
    agent: ['copilot_transfer', 'phase1b_compat', 'wearable_analysis', 'structured_audit', 'safety'],
};

const ONCO_SCHEMA = {
    primary: ['doc_type', 'risk_level', 'risk_score', 'progression_status', 'recist_alignment', 'pct_change_sum_diam', 'surveillance_trend', 'trigger_reason'],
    secondary: ['recommended_actions', 'clinical_explanation', 'safety_flags', 'domain_summary', 'followup_plan'],
    agent: ['copilot_transfer', 'phase1b_compat', 'guideline_followup', 'structured_audit'],
};

// ═══════════════════════════════════════════════════════════════════════
// VALUE RENDERERS
// ═══════════════════════════════════════════════════════════════════════

function renderValue(value, key, depth = 0) {
    if (value === null || value === undefined) {
        return <span className="schema-null">null</span>;
    }
    if (typeof value === 'boolean') {
        return (
            <span className={`schema-bool schema-bool--${value}`}>
                {value ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {String(value)}
            </span>
        );
    }
    if (typeof value === 'number') {
        const isScore = key?.includes('score') || key?.includes('pct');
        if (isScore && value >= 0 && value <= 1) {
            const pct = Math.round(value * 100);
            const color = pct >= 70 ? '#DC2626' : pct >= 40 ? '#D97706' : '#059669';
            return (
                <span className="schema-score">
                    <span className="schema-score-bar" style={{ width: `${pct}%`, background: color }} />
                    <span className="schema-score-val">{value.toFixed(2)}</span>
                </span>
            );
        }
        return <span className="schema-num">{value}</span>;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="schema-empty">[]</span>;
        return (
            <div className="schema-array">
                {value.map((item, i) => (
                    <span key={i} className="schema-array-item">
                        {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                    </span>
                ))}
            </div>
        );
    }
    if (typeof value === 'object') {
        return <ObjectDisplay obj={value} depth={depth} />;
    }

    // String values with special formatting
    if (key === 'label_class') {
        const colors = { operate_now: '#DC2626', watch_wait: '#D97706', avoid: '#6B7280' };
        return <span className="schema-badge" style={{ background: colors[value] || '#6B7280' }}>{value}</span>;
    }
    if (key === 'risk_level') {
        const colors = { red: '#DC2626', amber: '#D97706', green: '#059669' };
        return <span className="schema-badge" style={{ background: colors[value] || '#6B7280' }}>{value}</span>;
    }
    if (key === 'trajectory' || key === 'surveillance_trend') {
        const icons = { improving: TrendingUp, stable: Activity, deteriorating: TrendingDown, worsening: TrendingDown };
        const colors = { improving: '#059669', stable: '#0EA5E9', deteriorating: '#DC2626', worsening: '#DC2626' };
        const Icon = icons[value] || Activity;
        return (
            <span className="schema-trend" style={{ color: colors[value] || '#6B7280' }}>
                <Icon size={14} /> {value}
            </span>
        );
    }
    if (key === 'recist_alignment') {
        const colors = { CR: '#059669', PR: '#10B981', SD: '#0EA5E9', PD: '#DC2626', NE: '#6B7280' };
        return <span className="schema-badge" style={{ background: colors[value] || '#6B7280' }}>{value}</span>;
    }
    if (key === 'progression_status') {
        const colors = { stable_disease: '#059669', partial_response: '#10B981', complete_response: '#059669', confirmed_progression: '#DC2626', possible_progression: '#D97706' };
        return <span className="schema-badge" style={{ background: colors[value] || '#6B7280' }}>{value.replace(/_/g, ' ')}</span>;
    }

    return (
        <div className="schema-str">
            {String(value)}
        </div>
    );
}

function ObjectDisplay({ obj, depth = 0 }) {
    // Auto-expand top-level clinical objects or based on depth
    const [expanded, setExpanded] = useState(depth === 0 || obj.sbar || obj.news2_score);
    const keys = Object.keys(obj);

    if (keys.length === 0) return <span className="schema-empty">{'{}'}</span>;

    return (
        <div className="schema-obj">
            <button
                className={`schema-obj-toggle ${expanded ? 'is-expanded' : ''}`}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="schema-obj-toggle-left">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="schema-obj-label">{keys.length} fields</span>
                </div>
                {!expanded && (
                    <div className="schema-obj-preview">
                        {keys.slice(0, 3).join(', ')}{keys.length > 3 ? '...' : ''}
                    </div>
                )}
            </button>
            {expanded && (
                <div className="schema-obj-content">
                    {keys.map(k => (
                        <div key={k} className="schema-obj-row">
                            <span className="schema-obj-key">{k.replace(/_/g, ' ')}</span>
                            <div className="schema-obj-val">
                                {renderValue(obj[k], k, depth + 1)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function SchemaSection({ title, icon: Icon, keys, data, color }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="schema-section">
            <button
                className="schema-section-header"
                onClick={() => setExpanded(!expanded)}
                style={{ '--section-color': color }}
            >
                <div className="schema-section-title">
                    <div className="schema-section-icon" style={{ background: `${color}15`, color }}>
                        <Icon size={16} />
                    </div>
                    <span>{title}</span>
                </div>
                <div className="schema-section-meta">
                    <span className="schema-section-count">{keys.length} fields</span>
                    <div className={`schema-section-chevron ${expanded ? 'is-rotated' : ''}`}>
                        <ChevronDown size={16} />
                    </div>
                </div>
            </button>
            {expanded && (
                <div className="schema-section-body">
                    {keys.map(key => (
                        <div key={key} className="schema-row">
                            <span className="schema-key">{key}</span>
                            <div className="schema-val-container">
                                {data?.[key] !== undefined ? renderValue(data[key], key) : <span className="schema-missing">not provided</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export default function FullSchemaOutput({ data, adapter, caseText }) {
    if (!data) {
        return (
            <div className="schema-empty-state">
                <FileText size={32} />
                <p>No output data available</p>
            </div>
        );
    }

    const schema = adapter === 'phase1b' ? PHASE1B_SCHEMA
        : adapter === 'phase2' ? PHASE2_SCHEMA
            : ONCO_SCHEMA;

    const adapterName = adapter === 'phase1b' ? 'Phase 1B (Inpatient Triage)'
        : adapter === 'phase2' ? 'Phase 2 (SAFEGUARD Post-Discharge)'
            : 'Oncology Surveillance';

    const adapterIcon = adapter === 'phase1b' ? Stethoscope
        : adapter === 'phase2' ? Heart
            : Microscope;

    return (
        <div className="full-schema-output">
            <style>{schemaStyles}</style>
            <div className="schema-header">
                <div className="schema-header-left">
                    <div className="schema-header-icon">
                        {React.createElement(adapterIcon, { size: 20 })}
                    </div>
                    <div className="schema-header-text">
                        <span className="schema-header-title">{adapterName}</span>
                        <span className="schema-header-subtitle">Comprehensive Output Layer</span>
                    </div>
                </div>
                <div className="schema-header-badge">
                    SCHEMA VERSION 1.2
                </div>
            </div>

            {/* Case Text / Model Input Section */}
            {caseText && (
                <div className="schema-case-input">
                    <div className="schema-case-header">
                        <div className="schema-case-header-title">
                            <FileText size={14} />
                            <span>SOURCE CONTEXT / MODEL INPUT</span>
                        </div>
                        <div className="schema-case-len">{caseText.length} chars</div>
                    </div>
                    <div className="schema-case-content">
                        {caseText}
                    </div>
                </div>
            )}

            <div className="schema-sections">
                <SchemaSection
                    title="Primary Determinants"
                    icon={Target}
                    keys={schema.primary}
                    data={data}
                    color="#10B981"
                />

                <SchemaSection
                    title="Secondary & Clinical Observables"
                    icon={Activity}
                    keys={schema.secondary}
                    data={data}
                    color="#3B82F6"
                />

                <SchemaSection
                    title="Agent Synthesis & Metadata"
                    icon={Shield}
                    keys={schema.agent}
                    data={data}
                    color="#8B5CF6"
                />
            </div>

            {/* Raw JSON toggle */}
            <RawJsonSection data={data} />
        </div>
    );
}

function RawJsonSection({ data }) {
    const [showRaw, setShowRaw] = useState(false);

    return (
        <div className="schema-raw-section">
            <button className={`schema-raw-toggle ${showRaw ? 'is-active' : ''}`} onClick={() => setShowRaw(!showRaw)}>
                <FileText size={14} />
                <span>{showRaw ? 'HIDE' : 'VIEW'} RAW OUTPUT PAYLOAD</span>
            </button>
            {showRaw && (
                <div className="schema-raw-wrapper">
                    <div className="schema-raw-header">
                        <span>raw_output_trace.json</span>
                        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))} className="schema-copy">Copy</button>
                    </div>
                    <pre className="schema-raw-json">
                        {JSON.stringify(data, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLES (Modern Dark Theme)
// ═══════════════════════════════════════════════════════════════════════

export const schemaStyles = `
.full-schema-output {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    overflow: hidden;
    color: #1E293B;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.schema-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: #F8FAFC;
    border-bottom: 1px solid #E2E8F0;
}

.schema-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
}

.schema-header-icon {
    width: 40px;
    height: 40px;
    background: #F0FDFA;
    color: #14B8A6;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #CCFBF1;
}

.schema-header-text {
    display: flex;
    flex-direction: column;
}

.schema-header-title {
    font-weight: 700;
    font-size: 1.1rem;
    color: #0F172A;
}

.schema-header-subtitle {
    font-size: 0.75rem;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.schema-header-badge {
    font-size: 0.7rem;
    padding: 4px 10px;
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    color: #475569;
    border-radius: 6px;
    font-family: 'SF Mono', monospace;
}

.schema-case-input {
    background: #F8FAFC;
    border-bottom: 1px solid #E2E8F0;
}

.schema-case-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 24px;
    background: rgba(0, 0, 0, 0.02);
    border-bottom: 1px solid #E2E8F0;
}

.schema-case-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #64748B;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 1px;
}

.schema-case-len {
    font-size: 0.65rem;
    color: #94A3B8;
    font-family: 'SF Mono', monospace;
}

.schema-case-content {
    padding: 16px 24px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.85rem;
    line-height: 1.6;
    background: #0F172A;
    color: #E2E8F0;
    max-height: 250px;
    overflow-y: auto;
    scrollbar-width: thin;
    border-radius: 0 0 8px 8px;
}

.schema-sections {
    display: flex;
    flex-direction: column;
}

.schema-section {
    border-bottom: 1px solid #E2E8F0;
}

.schema-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 16px 24px;
    background: white;
    border: none;
    border-left: 4px solid var(--section-color);
    cursor: pointer;
    transition: background 0.2s;
}

.schema-section-header:hover {
    background: #F8FAFC;
}

.schema-section-title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    color: #0F172A;
}

.schema-section-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.schema-section-meta {
    display: flex;
    align-items: center;
    gap: 16px;
}

.schema-section-count {
    font-size: 0.7rem;
    padding: 2px 8px;
    background: #F1F5F9;
    color: #64748B;
    border-radius: 4px;
    font-family: 'SF Mono', monospace;
}

.schema-section-chevron {
    color: #94A3B8;
    transition: transform 0.2s;
}

.schema-section-chevron.is-rotated {
    transform: rotate(0deg);
}

.schema-section-body {
    padding: 4px 24px 24px 68px;
    background: #FCFDFF;
}

.schema-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 14px 0;
    border-bottom: 1px solid #F1F5F9;
    gap: 24px;
}

.schema-row:last-child {
    border-bottom: none;
}

.schema-key {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: #64748B;
    font-weight: 500;
    width: 200px;
    flex-shrink: 0;
    padding-top: 4px;
}

.schema-val-container {
    flex: 1;
    display: flex;
    justify-content: flex-start;
}

.schema-badge {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 1px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.schema-bool {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
}

.schema-bool--true {
    background: #D1FAE5;
    color: #065F46;
    border: 1px solid #A7F3D0;
}

.schema-bool--false {
    background: #FEE2E2;
    color: #991B1B;
    border: 1px solid #FECACA;
}

.schema-num {
    color: #7C3AED;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    background: #F5F3FF;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid #EDE9FE;
}

.schema-str {
    color: #334155;
    line-height: 1.6;
    text-align: left;
    background: #F8FAFC;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #E2E8F0;
    font-size: 0.85rem;
    width: 100%;
    white-space: pre-wrap;
    word-break: break-word;
}

.schema-null {
    color: #94A3B8;
    font-style: italic;
    font-size: 0.75rem;
}

.schema-missing {
    color: #CBD5E1;
    font-size: 0.75rem;
    background: #F8FAFC;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px dashed #E2E8F0;
}

.schema-trend {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    background: #F1F5F9;
    font-size: 0.8rem;
    font-weight: 600;
    border: 1px solid #E2E8F0;
}

.schema-score {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 300px;
}

.schema-score-bar {
    height: 8px;
    background: #E2E8F0;
    border-radius: 4px;
    flex: 1;
    overflow: hidden;
    position: relative;
}

.schema-score-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 700;
    color: #475569;
    min-width: 40px;
}

.schema-array {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-start;
}

.schema-array-item {
    padding: 6px 12px;
    background: #EFF6FF;
    color: #1D4ED8;
    border: 1px solid #DBEAFE;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
}

/* Custom Object Display */
.schema-obj {
    width: 100%;
}

.schema-obj-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: auto;
    min-width: 140px;
    padding: 6px 12px;
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 4px;
}

.schema-obj-toggle:hover {
    background: #E2E8F0;
}

.schema-obj-toggle.is-expanded {
    background: #14B8A6;
    border-color: #14B8A6;
    color: white;
}

.schema-obj-toggle-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

.schema-obj-toggle.is-expanded .schema-obj-toggle-left,
.schema-obj-toggle.is-expanded .schema-obj-label {
    color: white;
}

.schema-obj-label {
    font-size: 0.7rem;
    font-weight: 800;
    color: #0D9488;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.schema-obj-preview {
    font-size: 0.7rem;
    color: #94A3B8;
    font-family: 'JetBrains Mono', monospace;
    margin-left: 12px;
}

.schema-obj-content {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 8px 20px;
    margin-top: 8px;
    margin-bottom: 12px;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
}

.schema-obj-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 12px 0;
    border-bottom: 1px solid #E2E8F0;
    gap: 20px;
}

.schema-obj-row:last-child {
    border-bottom: none;
}

.schema-obj-key {
    font-size: 0.75rem;
    color: #64748B;
    font-family: 'JetBrains Mono', monospace;
    width: 140px;
    flex-shrink: 0;
    padding-top: 4px;
}

.schema-obj-val {
    flex: 1;
    display: flex;
    justify-content: flex-start;
}

.schema-raw-section {
    padding: 24px;
    background: #F8FAFC;
    border-top: 1px solid #E2E8F0;
}

.schema-raw-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    background: white;
    border: 1px solid #E2E8F0;
    color: #64748B;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.schema-raw-toggle:hover {
    background: #F1F5F9;
    color: #475569;
}

.schema-raw-toggle.is-active {
    background: #0F172A;
    color: #14B8A6;
    border-color: #0F172A;
}

.schema-raw-wrapper {
    margin-top: 16px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #0F172A;
}

.schema-raw-header {
    background: #0F172A;
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #94A3B8;
    font-size: 0.7rem;
    font-family: 'SF Mono', monospace;
}

.schema-copy {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #CBD5E1;
    font-size: 0.65rem;
    padding: 2px 8px;
    border-radius: 4px;
}

.schema-copy:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
}

.schema-raw-json {
    padding: 16px;
    background: #0B0F1A;
    color: #10B981;
    font-family: 'SF Mono', monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    overflow-x: auto;
}
`;
