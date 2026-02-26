/**
 * ClinicalOutputCard — adapter-specific premium output rendering.
 * Used by DemoShowcase for the 9-case end-to-end simulation.
 */
import { useState } from 'react';
import {
    AlertTriangle, Eye, Ban, CheckCircle, AlertCircle, Siren, TrendingUp, Activity,
    ChevronDown, ChevronRight, Brain, Flag, Zap, Search, FileText, BarChart3,
    MessageSquare, Shield, Calendar, ClipboardList
} from 'lucide-react';

// ── Risk / decision colour maps ───────────────────────────────────
const RISK_COLOR = {
    operate_now: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'OPERATE NOW', Icon: AlertTriangle },
    watch_wait: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', label: 'WATCH & WAIT', Icon: Eye },
    avoid: { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1', label: 'AVOID SURGERY', Icon: Ban },
    green: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7', label: 'LOW RISK', Icon: CheckCircle },
    amber: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', label: 'MODERATE RISK', Icon: AlertCircle },
    red: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'HIGH RISK — ESCALATE', Icon: Siren },
    stable_disease: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7', label: 'STABLE DISEASE', Icon: CheckCircle },
    possible_progression: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', label: 'POSSIBLE PROGRESSION', Icon: TrendingUp },
    confirmed_progression: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'CONFIRMED PROGRESSION', Icon: Activity },
};

function getDecisionKey(data) {
    return data?.label_class || data?.progression_status || data?.risk_level;
}

function Chip({ color = 'muted', children, large }) {
    return (
        <span className={`chip ${color}`} style={large ? { fontSize: '0.9rem', padding: '6px 16px' } : {}}>
            {children}
        </span>
    );
}

function Section({ title, icon: IconComponent, children, collapsible }) {
    const [open, setOpen] = useState(true);
    if (!children) return null;
    return (
        <div className="coc-section">
            <div
                className={`coc-section-header ${collapsible ? 'collapsible' : ''}`}
                onClick={collapsible ? () => setOpen(v => !v) : undefined}
            >
                {IconComponent && <span className="coc-section-icon"><IconComponent size={16} /></span>}
                <span className="coc-section-title">{title}</span>
                {collapsible && <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
            </div>
            {open && <div className="coc-section-body">{children}</div>}
        </div>
    );
}

// ── Phase 1B Output ───────────────────────────────────────────────
function Phase1bOutput({ data }) {
    const key = getDecisionKey(data);
    const cfg = RISK_COLOR[key] || RISK_COLOR.watch_wait;
    const sbar = data?.sbar || data?.copilot_transfer?.sbar;

    return (
        <div className="coc-root">
            {/* Decision badge */}
            <div className="coc-decision-badge" style={{ background: cfg.bg, borderColor: cfg.border }}>
                <div className="coc-decision-icon">{cfg.Icon && <cfg.Icon size={24} />}</div>
                <div>
                    <div className="coc-decision-label" style={{ color: cfg.text }}>{cfg.label}</div>
                    <div className="coc-decision-sub" style={{ color: cfg.text, opacity: 0.75 }}>
                        Surgical decision recommendation
                    </div>
                </div>
            </div>

            {/* Trajectory */}
            {data.trajectory && (
                <Section title="Clinical Trajectory" icon={TrendingUp}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="trajectory-arrow" data-traj={data.trajectory}>
                            {data.trajectory === 'deteriorating' ? '↘' : data.trajectory === 'improving' ? '↗' : '→'}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '1rem', textTransform: 'capitalize' }}>
                            {data.trajectory}
                        </span>
                    </div>
                </Section>
            )}

            {/* Red flags */}
            {data.red_flag_triggered && (
                <Section title="Red Flags Triggered" icon={Flag}>
                    <div className="chip-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {(data.red_flags || []).map((f, i) => (
                            <Chip key={i} color="red">{f.replace(/_/g, ' ')}</Chip>
                        ))}
                    </div>
                </Section>
            )}
            {!data.red_flag_triggered && (
                <Section title="Safety Check" icon={CheckCircle}>
                    <Chip color="green">No red flags triggered</Chip>
                </Section>
            )}

            {/* Clinical rationale */}
            {(data?.clinical_explanation || data?.clinical_rationale) && (
                <Section title="Clinical Reasoning" icon={Brain}>
                    <div className="coc-explanation">{data.clinical_explanation || data.clinical_rationale}</div>
                </Section>
            )}

            {/* Image analysis - MedGemma 4B */}
            {data?.image_analysis && (
                <Section title="Wound Image Analysis" icon={Search} color="blue">
                    <div className="image-analysis-container">
                        <div className="coc-explanation" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 12 }}>
                            {typeof data.image_analysis === 'string'
                                ? data.image_analysis
                                : (data.image_analysis.wound_status || data.image_analysis.description)}
                        </div>
                        <div className="img-analysis-footer" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 8 }}>
                            Analyzed via MedGemma 4B Vision
                        </div>
                    </div>
                </Section>
            )}

            {/* SBAR */}
            {sbar && (sbar.situation || sbar.background || sbar.assessment || sbar.recommendation) && (
                <Section title="SBAR Communication" icon={ClipboardList} collapsible>
                    <div className="sbar-card">
                        {['situation', 'background', 'assessment', 'recommendation'].map(k => (
                            sbar[k] ? (
                                <div key={k} className="sbar-row-full">
                                    <div className="sbar-letter">{k[0].toUpperCase()}</div>
                                    <div className="sbar-label-full">{k.charAt(0).toUpperCase() + k.slice(1)}</div>
                                    <div className="sbar-text-full">{sbar[k]}</div>
                                </div>
                            ) : null
                        ))}
                    </div>
                </Section>
            )}

            {/* Patient Message */}
            {data?.patient_message && (data.patient_message.summary || data.patient_message.self_care?.length > 0) && (
                <Section title="Patient Message" icon={MessageSquare} collapsible>
                    <div className="patient-message-card">
                        {data.patient_message.summary && (
                            <p className="patient-message-summary">{data.patient_message.summary}</p>
                        )}
                        {data.patient_message.self_care?.length > 0 && (
                            <div className="patient-message-list">
                                <div className="pm-list-label">Self-care instructions:</div>
                                <ul>
                                    {data.patient_message.self_care.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            </div>
                        )}
                        {data.patient_message.next_checkin && (
                            <div className="pm-next-checkin">
                                <span>Next check-in:</span> {data.patient_message.next_checkin}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* Follow-up questions */}
            {data?.followup_questions?.length > 0 && (
                <Section title="Follow-up Questions" icon={MessageSquare} collapsible>
                    <ul className="action-list">
                        {data.followup_questions.map((q, i) => (
                            <li key={i}>{q}</li>
                        ))}
                    </ul>
                </Section>
            )}

            {/* Image analysis */}
            {data?.image_analysis && (
                <Section title="Wound Image Analysis" icon={Eye} collapsible>
                    <div className="coc-explanation">
                        {data.image_analysis.wound_status && (
                            <div style={{ marginBottom: 8 }}>
                                <strong>Status:</strong> {data.image_analysis.wound_status}
                            </div>
                        )}
                        {data.image_analysis.description && (
                            <div>{data.image_analysis.description}</div>
                        )}
                    </div>
                </Section>
            )}
        </div>
    );
}

// ── Phase 2 Output ────────────────────────────────────────────────
function Phase2Output({ data }) {
    const key = data?.risk_level || 'green';
    const cfg = RISK_COLOR[key] || RISK_COLOR.green;
    const score = typeof data?.risk_score === 'number' ? data.risk_score : null;
    const sbar = data?.copilot_transfer?.sbar;
    const [showSbar, setShowSbar] = useState(false);

    return (
        <div className="coc-root">
            {/* Risk badge + gauge */}
            <div className="coc-decision-badge" style={{ background: cfg.bg, borderColor: cfg.border }}>
                <div className="coc-decision-icon">{cfg.Icon && <cfg.Icon size={24} />}</div>
                <div style={{ flex: 1 }}>
                    <div className="coc-decision-label" style={{ color: cfg.text }}>{cfg.label}</div>
                    <div className="coc-decision-sub" style={{ color: cfg.text, opacity: 0.75 }}>
                        Post-discharge risk assessment
                    </div>
                </div>
                {score !== null && (
                    <div className="risk-gauge-wrap">
                        <RiskGauge score={score} color={key === 'red' ? '#DC2626' : key === 'amber' ? '#D97706' : '#059669'} />
                        <div className="risk-gauge-label" style={{ color: cfg.text }}>{(score * 100).toFixed(0)}%</div>
                    </div>
                )}
            </div>

            {/* Timeline deviation */}
            {data?.timeline_deviation && data.timeline_deviation !== 'none' && (
                <Section title="Recovery Deviation" icon={BarChart3}>
                    <Chip color={data.timeline_deviation === 'severe' ? 'red' : 'amber'}>
                        {data.timeline_deviation.toUpperCase()} DEVIATION from expected recovery
                    </Chip>
                </Section>
            )}

            {/* Trigger reasons */}
            {data?.trigger_reason?.length > 0 && (
                <Section title="Triggers Detected" icon={Zap}>
                    <div className="chip-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {data.trigger_reason.map((t, i) => (
                            <Chip key={i} color={key === 'red' ? 'red' : 'amber'}>{t.replace(/_/g, ' ')}</Chip>
                        ))}
                    </div>
                </Section>
            )}

            {/* Domain flags */}
            {data?.domain_flags && (
                <Section title="Domain Flags" icon={Search}>
                    <div className="domain-flags-grid">
                        {Object.entries(data.domain_flags).map(([k, v]) => (
                            <div key={k} className={`domain-flag-cell ${v ? 'flagged' : 'clear'}`}>
                                <span>{v ? <AlertCircle size={14} /> : <CheckCircle size={14} />}</span>
                                <span>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Clinical explanation */}
            {data?.clinical_explanation && (
                <Section title="Clinical Reasoning" icon={Brain}>
                    <div className="coc-explanation">{data.clinical_explanation}</div>
                </Section>
            )}

            {/* Wound Image Analysis - MedGemma 4B */}
            {data?.image_analysis && (
                <Section title="Wound Image Analysis" icon={Search} color="blue">
                    <div className="image-analysis-container">
                        <div className="coc-explanation" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 12 }}>
                            {data.image_analysis}
                        </div>
                        <div className="img-analysis-footer" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 8 }}>
                            Analyzed via MedGemma 4B Vision
                        </div>
                    </div>
                </Section>
            )}

            {/* Evidence */}
            {data?.evidence?.length > 0 && (
                <Section title="Evidence Summary" icon={FileText} collapsible>
                    <div className="evidence-list">
                        {data.evidence.map((e, i) => (
                            <div key={i} className="evidence-row">
                                <span className="evidence-source">{e.source}</span>
                                <span className="evidence-finding">{e.finding}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* SBAR Escalation */}
            {sbar && (
                <Section title="SBAR Escalation Report" icon={ClipboardList} collapsible>
                    {data?.copilot_transfer?.send_to_clinician && (
                        <div style={{ marginBottom: 12 }}>
                            <Chip color="red"><AlertTriangle size={12} /> Send to Clinician NOW</Chip>
                        </div>
                    )}
                    <div className="sbar-card">
                        {['situation', 'background', 'assessment', 'recommendation'].map(k => (
                            sbar[k] ? (
                                <div key={k} className="sbar-row-full">
                                    <div className="sbar-letter">{k[0].toUpperCase()}</div>
                                    <div className="sbar-label-full">{k.charAt(0).toUpperCase() + k.slice(1)}</div>
                                    <div className="sbar-text-full">{sbar[k]}</div>
                                </div>
                            ) : null
                        ))}
                    </div>
                </Section>
            )}

            {/* Patient Message */}
            {data?.patient_message && (
                <Section title="Patient Message" icon={MessageSquare} collapsible>
                    <div className="patient-message-card">
                        {data.patient_message.summary && (
                            <p className="patient-message-summary">{data.patient_message.summary}</p>
                        )}
                        {data.patient_message.self_care?.length > 0 && (
                            <div className="patient-message-list">
                                <div className="pm-list-label">Self-care instructions:</div>
                                <ul>
                                    {data.patient_message.self_care.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            </div>
                        )}
                        {data.patient_message.next_checkin && (
                            <div className="pm-next-checkin">
                                <span>Next check-in:</span> {data.patient_message.next_checkin}
                            </div>
                        )}
                    </div>
                </Section>
            )}
        </div>
    );
}

// ── Onco Output ───────────────────────────────────────────────────
function OncOutput({ data }) {
    const key = data?.progression_status || data?.risk_level;
    const cfg = RISK_COLOR[key] || RISK_COLOR.stable_disease;
    const score = typeof data?.risk_score === 'number' ? data.risk_score : null;
    const sbar = data?.copilot_transfer?.sbar;

    return (
        <div className="coc-root">
            {/* Progression badge */}
            <div className="coc-decision-badge" style={{ background: cfg.bg, borderColor: cfg.border }}>
                <div className="coc-decision-icon">{cfg.Icon && <cfg.Icon size={24} />}</div>
                <div style={{ flex: 1 }}>
                    <div className="coc-decision-label" style={{ color: cfg.text }}>{cfg.label}</div>
                    <div className="coc-decision-sub" style={{ color: cfg.text, opacity: 0.75 }}>
                        Oncology surveillance assessment
                    </div>
                </div>
                {score !== null && (
                    <div className="risk-gauge-wrap">
                        <RiskGauge score={score} color={key === 'confirmed_progression' ? '#DC2626' : key === 'possible_progression' ? '#D97706' : '#059669'} />
                        <div className="risk-gauge-label" style={{ color: cfg.text }}>{(score * 100).toFixed(0)}%</div>
                    </div>
                )}
            </div>

            {/* RECIST + Trend chips */}
            <div className="chip-row" style={{ marginBottom: 4 }}>
                {data?.recist_alignment && (
                    <Chip color={data.recist_alignment === 'PD' ? 'red' : data.recist_alignment === 'CR' ? 'green' : 'muted'}>
                        RECIST: {data.recist_alignment}
                    </Chip>
                )}
                {data?.surveillance_trend && (
                    <Chip color={data.surveillance_trend === 'worsening' ? 'red' : data.surveillance_trend === 'improving' ? 'green' : 'muted'}>
                        Trend: {data.surveillance_trend}
                    </Chip>
                )}
                {typeof data?.pct_change_sum_diam === 'number' && (
                    <Chip color={data.pct_change_sum_diam > 20 ? 'red' : data.pct_change_sum_diam < -10 ? 'green' : 'muted'}>
                        Size: {data.pct_change_sum_diam > 0 ? '+' : ''}{data.pct_change_sum_diam.toFixed(1)}%
                    </Chip>
                )}
                {data?.copilot_transfer?.urgency && (
                    <Chip color={data.copilot_transfer.urgency === 'immediate' ? 'red' : data.copilot_transfer.urgency === 'same_week' ? 'amber' : 'muted'}>
                        Urgency: {data.copilot_transfer.urgency.replace(/_/g, ' ')}
                    </Chip>
                )}
            </div>

            {/* Trigger reasons */}
            {data?.trigger_reason?.length > 0 && (
                <Section title="Triggers" icon={Zap}>
                    <div className="chip-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {data.trigger_reason.map((t, i) => (
                            <Chip key={i} color={key === 'confirmed_progression' ? 'red' : 'amber'}>{t.replace(/_/g, ' ')}</Chip>
                        ))}
                    </div>
                </Section>
            )}

            {/* Domain summary */}
            {data?.domain_summary && (
                <Section title="Multi-Domain Summary" icon={Search}>
                    <div className="domain-summary-grid">
                        {data.domain_summary.imaging && (
                            <div className="dsumm-row">
                                <span className="dsumm-key">Imaging</span>
                                <span className="dsumm-val">{data.domain_summary.imaging}</span>
                            </div>
                        )}
                        {data.domain_summary.labs && (
                            <div className="dsumm-row">
                                <span className="dsumm-key">Labs</span>
                                <span className="dsumm-val">{data.domain_summary.labs}</span>
                            </div>
                        )}
                        {data.domain_summary.symptoms && (
                            <div className="dsumm-row">
                                <span className="dsumm-key">Symptoms</span>
                                <span className="dsumm-val">{data.domain_summary.symptoms}</span>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* Clinical explanation */}
            {data?.clinical_explanation && (
                <Section title="Clinical Reasoning" icon={Brain}>
                    <div className="coc-explanation">{data.clinical_explanation}</div>
                </Section>
            )}

            {/* Wound Image Analysis - MedGemma 4B */}
            {data?.image_analysis && (
                <Section title="Wound Image Analysis" icon={Search} color="blue">
                    <div className="image-analysis-container">
                        <div className="coc-explanation" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 12 }}>
                            {data.image_analysis}
                        </div>
                        <div className="img-analysis-footer" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 8 }}>
                            Analyzed via MedGemma 4B Vision
                        </div>
                    </div>
                </Section>
            )}

            {/* Recommended actions */}
            {data?.recommended_actions?.length > 0 && (
                <Section title="Recommended Actions" icon={ClipboardList}>
                    <ul className="action-list">
                        {data.recommended_actions.map((a, i) => (
                            <li key={i}>{a.replace(/_/g, ' ')}</li>
                        ))}
                    </ul>
                </Section>
            )}

            {/* Follow-up plan */}
            {data?.followup_plan && (
                <Section title="Follow-up Plan" icon={Calendar} collapsible>
                    <div className="followup-grid">
                        {data.followup_plan.next_imaging && (
                            <div className="followup-row"><span>Imaging</span><span>{data.followup_plan.next_imaging}</span></div>
                        )}
                        {data.followup_plan.next_labs && (
                            <div className="followup-row"><span>Labs</span><span>{data.followup_plan.next_labs}</span></div>
                        )}
                        {data.followup_plan.next_visit && (
                            <div className="followup-row"><span>Visit</span><span>{data.followup_plan.next_visit}</span></div>
                        )}
                    </div>
                </Section>
            )}

            {/* Safety flags */}
            {data?.safety_flags && (
                <Section title="Safety Flags" icon={Shield} collapsible>
                    <div className="safety-flags-grid">
                        {Object.entries(data.safety_flags).map(([k, v]) => (
                            <div key={k} className={`safety-flag-cell ${v ? 'flagged' : 'clear'}`}>
                                <span className="safety-flag-dot" />
                                <span className="safety-flag-label">{k.replace(/_/g, ' ')}</span>
                                <span className="safety-flag-val">{v ? 'YES' : 'no'}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* SBAR */}
            {sbar && (
                <Section title="SBAR Escalation" icon={ClipboardList} collapsible>
                    {data?.copilot_transfer?.send_to_oncologist && (
                        <div style={{ marginBottom: 12 }}>
                            <Chip color="red"><AlertTriangle size={12} /> Refer to Oncologist</Chip>
                        </div>
                    )}
                    <div className="sbar-card">
                        {['situation', 'background', 'assessment', 'recommendation'].map(k => (
                            sbar[k] ? (
                                <div key={k} className="sbar-row-full">
                                    <div className="sbar-letter">{k[0].toUpperCase()}</div>
                                    <div className="sbar-label-full">{k.charAt(0).toUpperCase() + k.slice(1)}</div>
                                    <div className="sbar-text-full">{sbar[k]}</div>
                                </div>
                            ) : null
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
}

// ── Risk Gauge (SVG arc) ─────────────────────────────────────────
function RiskGauge({ score, color }) {
    const pct = Math.min(1, Math.max(0, score));
    const R = 22, cx = 28, cy = 28;
    const startAngle = -180, endAngle = 0;
    const angle = startAngle + pct * (endAngle - startAngle);
    const toRad = d => (d * Math.PI) / 180;
    const arcX = cx + R * Math.cos(toRad(angle));
    const arcY = cy + R * Math.sin(toRad(angle));
    const trackPath = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
    const fillPath = pct > 0
        ? `M ${cx - R} ${cy} A ${R} ${R} 0 ${pct > 0.5 ? 1 : 0} 1 ${arcX} ${arcY}`
        : '';
    return (
        <svg width={56} height={30} viewBox="0 0 56 30">
            <path d={trackPath} fill="none" stroke="#E2E8F0" strokeWidth={5} strokeLinecap="round" />
            {fillPath && <path d={fillPath} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />}
        </svg>
    );
}

// ── Root dispatcher ───────────────────────────────────────────────
export default function ClinicalOutputCard({ data, adapter, adapterMeta, validation }) {
    if (!data) return null;

    const key = getDecisionKey(data);
    const cfg = RISK_COLOR[key];

    return (
        <div className="coc-wrapper">
            <div className="coc-wrapper-header">
                <span className="coc-wrapper-title">AI Clinical Output</span>
                {cfg && (
                    <span
                        className="chip"
                        style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        {cfg.Icon && <cfg.Icon size={14} />} {cfg.label}
                    </span>
                )}
            </div>

            {adapter === 'phase1b' && <Phase1bOutput data={data} />}
            {adapter === 'phase2' && <Phase2Output data={data} />}
            {adapter === 'onc' && <OncOutput data={data} />}

            {/* Schema status */}
            {validation && (
                <div className={`coc-schema-badge ${validation.pass ? 'pass' : 'warn'}`}>
                    {validation.pass
                        ? <><CheckCircle size={14} /> Schema validation passed — all required fields present</>
                        : <><AlertCircle size={14} /> Schema warnings: {validation.errors.slice(0, 3).join('; ')}</>}
                </div>
            )}
        </div>
    );
}
