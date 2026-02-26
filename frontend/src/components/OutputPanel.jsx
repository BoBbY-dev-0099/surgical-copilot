import { useState } from 'react';
import { useNotice } from '../context/NoticeContext';
import { downloadJson } from '../utils/downloadJson';

/**
 * Shared output panel — renders response.parsed fields from schemas.py.
 *
 * Section order:
 *  1) Status pill (real/demo) + fallback reason
 *  2) Primary chips (risk / trajectory / decision)
 *  3) One-line summary / clinical_explanation
 *  4) Next steps / recommended_actions
 *  5) Red flags / trigger_reason chips
 *  6) SBAR card (accordion)
 *  7) Safety flags (onc)
 *  8) Consensus & Reviewer Badges
 *  9) Collapsibles: Reviewer, Evidence, Parsed JSON, Raw
 *  10) Schema PASS/FAIL
 */
export default function OutputPanel({
    data, rawText, isDemo, loading, validation, adapter, fallbackReason,
    reviewerData = null,
    rulesData = null,
    consensusStatus = null,
    safetyOverride = false,
    onDownloadEvidence = null
}) {
    const { pushNotice } = useNotice();
    const [showJson, setShowJson] = useState(true);
    const [showRaw, setShowRaw] = useState(false);
    const [showSbar, setShowSbar] = useState(false);
    const [showReviewer, setShowReviewer] = useState(false);
    const [showEvidence, setShowEvidence] = useState(false);

    const handleCopy = () => {
        if (!data) return;
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        pushNotice({ type: 'info', title: 'Copied', message: 'Output copied to clipboard' });
    };

    // Resolve risk display
    const riskLevel = data?.risk_level || data?.label_class || null;
    const riskColor = ['red', 'operate_now'].includes(riskLevel) ? 'red'
        : ['amber', 'watch_wait'].includes(riskLevel) ? 'amber' : 'green';

    const trajectory = data?.trajectory || data?.progression_status || null;
    const decision = data?.label_class || null;
    const riskScore = typeof data?.risk_score === 'number' ? data.risk_score : null;
    const recist = data?.recist_alignment || null;
    const clinicalExplanation = data?.clinical_explanation || null;
    const nextSteps = data?.recommended_actions || [];
    const redFlags = data?.red_flags || [];
    const triggerReasons = data?.trigger_reason || [];

    // SBAR: Priority to top-level clinician edits (snake or camel)
    const sbar = data?.sbar || data?.copilot_transfer?.sbar || null;
    const oncUrgency = data?.urgency || data?.copilot_transfer?.urgency || null;
    const sendToClinician = data?.send_to_clinician || data?.send_to_oncologist || data?.copilot_transfer?.send_to_clinician || false;

    // Safety flags (onc)
    const safetyFlags = data?.safety_flags || null;

    // Phase1b compat (for phase2/onc)
    const phase1bCompat = data?.phase1b_compat || null;

    return (
        <div className="output-panel">
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Adapter Testing (not judging)
            </div>

            {/* 1) Status pill + fallback */}
            {isDemo && data && (
                <div className="demo-banner">
                    {fallbackReason ? `Fallback: ${fallbackReason}` : 'Inference failed — showing demo output'}
                </div>
            )}

            {loading && (
                <div className="loading-overlay">
                    <span className="spinner" /> Running inference…
                </div>
            )}

            {!loading && !data && (
                <div className="output-empty">Run inference to see output</div>
            )}

            {!loading && data && (
                <div className="canvas-view">
                    {/* 2) Primary chips */}
                    <div className="chip-row">
                        {riskLevel && (
                            <span className={`chip ${riskColor}`}>
                                {adapter === 'phase1b' ? `Decision: ${decision || riskLevel}` : `Risk: ${riskLevel}`}
                            </span>
                        )}
                        {trajectory && (
                            <span className="chip muted">
                                {data?.progression_status ? `Progression: ${trajectory}` : `Trajectory: ${trajectory}`}
                            </span>
                        )}
                        {riskScore !== null && (
                            <span className="chip muted">Score: {riskScore.toFixed(2)}</span>
                        )}
                        {recist && (
                            <span className={`chip ${recist === 'PD' ? 'red' : recist === 'CR' ? 'green' : 'muted'}`}>
                                RECIST: {recist}
                            </span>
                        )}
                        {oncUrgency && (
                            <span className={`chip ${oncUrgency === 'immediate' ? 'red' : oncUrgency === 'urgent' ? 'amber' : 'muted'}`}>
                                Urgency: {oncUrgency}
                            </span>
                        )}
                        {sendToClinician && (
                            <span className="chip red">Escalate</span>
                        )}
                        {data?.red_flag_triggered === true && (
                            <span className="chip red">Red Flag Triggered</span>
                        )}

                        {/* Reviewer Badges */}
                        {consensusStatus && (
                            <span className={`chip ${consensusStatus === 'agree' ? 'green' : consensusStatus === 'disagree' ? 'red' : 'muted'}`}>
                                CONSENSUS: {consensusStatus.toUpperCase()}
                            </span>
                        )}
                        {safetyOverride && (
                            <span className="chip red pulse-dot">SAFETY OVERRIDE</span>
                        )}
                        {(safetyOverride || data?.red_flag_triggered) && (
                            <span className="chip red">ESCALATE</span>
                        )}
                    </div>

                    {/* Timeline deviation (phase2) */}
                    {data?.timeline_deviation && data.timeline_deviation !== 'none' && (
                        <div className="output-summary" style={{ borderLeftColor: data.timeline_deviation === 'severe' ? 'var(--red)' : 'var(--amber)' }}>
                            Timeline deviation: {data.timeline_deviation}
                        </div>
                    )}

                    {/* 3) Clinical explanation / summary */}
                    {clinicalExplanation && (
                        <div className="output-summary">{clinicalExplanation}</div>
                    )}

                    {/* 4) Next steps / recommended_actions */}
                    {nextSteps.length > 0 && (
                        <div className="mini-card">
                            <div className="mini-card-title">Recommended Actions</div>
                            <ul className="next-steps-list">
                                {nextSteps.map((s, i) => <li key={i}>{s.replace(/_/g, ' ')}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* 5) Red flags + triggers */}
                    {(redFlags.length > 0 || triggerReasons.length > 0) && (
                        <div className="mini-card">
                            <div className="mini-card-title">
                                {redFlags.length > 0 ? 'Red Flags' : 'Triggers'}
                            </div>
                            <div className="mini-card-chips">
                                {(redFlags.length > 0 ? redFlags : triggerReasons).map((f, i) => (
                                    <span key={i} className="chip red">{f.replace(/_/g, ' ')}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Show triggers separately if both red flags and triggers exist */}
                    {redFlags.length > 0 && triggerReasons.length > 0 && (
                        <div className="mini-card">
                            <div className="mini-card-title">Trigger Reasons</div>
                            <div className="mini-card-chips">
                                {triggerReasons.map((f, i) => (
                                    <span key={i} className="chip amber">{f.replace(/_/g, ' ')}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 6) SBAR accordion */}
                    {sbar && (
                        <div className="accordion" style={{ marginTop: 8 }}>
                            <button className="accordion-header" onClick={() => setShowSbar(!showSbar)}>
                                <span>SBAR Escalation</span>
                                <span>{showSbar ? '▾' : '▸'}</span>
                            </button>
                            {showSbar && (
                                <div className="accordion-body">
                                    <div className="sbar-grid">
                                        {['situation', 'background', 'assessment', 'recommendation'].map(key => {
                                            const val = sbar[key] || sbar[key.charAt(0).toUpperCase() + key.slice(1)] || sbar[key.charAt(0).toUpperCase()];
                                            return val ? (
                                                <div key={key} className="sbar-row">
                                                    <span className="sbar-label">{key[0].toUpperCase()}</span>
                                                    <span className="sbar-text">{val}</span>
                                                </div>
                                            ) : null;
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 7) Safety flags (onc) */}
                    {safetyFlags && (
                        <div className="mini-card">
                            <div className="mini-card-title">Safety Flags</div>
                            <div className="mini-card-chips">
                                {Object.entries(safetyFlags).map(([k, v]) => (
                                    <span key={k} className={`chip ${v ? 'red' : 'muted'}`}>
                                        {k.replace(/_/g, ' ')}: {v ? 'YES' : 'no'}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 7b) Domain Summary (27B onco) */}
                    {data?.domain_summary && (
                        <div className="mini-card">
                            <div className="mini-card-title">Domain Summary</div>
                            <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                                {data.domain_summary.imaging && <div><strong>Imaging:</strong> {data.domain_summary.imaging}</div>}
                                {data.domain_summary.labs && <div><strong>Labs:</strong> {data.domain_summary.labs}</div>}
                                {data.domain_summary.symptoms && <div><strong>Symptoms:</strong> {data.domain_summary.symptoms}</div>}
                            </div>
                        </div>
                    )}

                    {/* 7c) Followup Plan (27B onco) */}
                    {data?.followup_plan && (
                        <div className="mini-card">
                            <div className="mini-card-title">Follow-up Plan</div>
                            <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                                {data.followup_plan.next_imaging && <div><strong>Next Imaging:</strong> {data.followup_plan.next_imaging}</div>}
                                {data.followup_plan.next_labs && <div><strong>Next Labs:</strong> {data.followup_plan.next_labs}</div>}
                                {data.followup_plan.next_visit && <div><strong>Next Visit:</strong> {data.followup_plan.next_visit}</div>}
                            </div>
                        </div>
                    )}

                    {/* 7d) Surveillance Trend (27B onco) */}
                    {data?.surveillance_trend && (
                        <div className="chip-row" style={{ marginTop: 8 }}>
                            <span className={`chip ${data.surveillance_trend === 'worsening' ? 'red' : data.surveillance_trend === 'improving' ? 'green' : 'muted'}`}>
                                Trend: {data.surveillance_trend}
                            </span>
                            {typeof data.pct_change_sum_diam === 'number' && (
                                <span className={`chip ${data.pct_change_sum_diam > 20 ? 'red' : data.pct_change_sum_diam < -30 ? 'green' : 'muted'}`}>
                                    Size Change: {data.pct_change_sum_diam > 0 ? '+' : ''}{data.pct_change_sum_diam.toFixed(1)}%
                                </span>
                            )}
                        </div>
                    )}

                    {/* 7e) Audit Block (27B all adapters) */}
                    {data?.audit && (
                        <div className="mini-card">
                            <div className="mini-card-title">AI Audit</div>
                            <div className="chip-row">
                                <span className={`chip ${data.audit.confidence === 'high' ? 'green' : data.audit.confidence === 'low' ? 'amber' : 'muted'}`}>
                                    Confidence: {data.audit.confidence}
                                </span>
                                {data.audit.needs_human_review && (
                                    <span className="chip amber">Needs Human Review</span>
                                )}
                            </div>
                            {data.audit.key_evidence?.length > 0 && (
                                <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
                                    <strong>Key Evidence:</strong>
                                    <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                                        {data.audit.key_evidence.map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                </div>
                            )}
                            {data.audit.uncertainty_reason && (
                                <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--amber)' }}>
                                    <strong>Uncertainty:</strong> {data.audit.uncertainty_reason}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 7f) Patient Message (27B phase2 + clinician edits) */}
                    {(data?.patient_message || data?.patientMessage) && (
                        <div className="mini-card">
                            <div className="mini-card-title">Patient Outreach</div>
                            {((data?.patient_message || data?.patientMessage)?.summary) && (
                                <div style={{ fontSize: '0.9rem', marginBottom: 8 }}>{(data?.patient_message || data?.patientMessage).summary}</div>
                            )}
                            {((data?.patient_message || data?.patientMessage)?.self_care?.length > 0) && (
                                <div style={{ fontSize: '0.85rem' }}>
                                    <strong>Self-Care:</strong>
                                    <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                                        {(data?.patient_message || data?.patientMessage).self_care.map((s, i) => <li key={i}>{s}</li>)}
                                    </ul>
                                </div>
                            )}
                            {((data?.patient_message || data?.patientMessage)?.next_checkin) && (
                                <div style={{ fontSize: '0.85rem', marginTop: 8 }}>
                                    <strong>Next Check-in:</strong> {(data?.patient_message || data?.patientMessage).next_checkin}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 7g) Watch Parameters (27B phase1b) */}
                    {data?.watch_parameters?.length > 0 && (
                        <div className="mini-card">
                            <div className="mini-card-title">Watch Parameters</div>
                            <div className="mini-card-chips">
                                {data.watch_parameters.map((p, i) => (
                                    <span key={i} className="chip muted">{p.replace(/_/g, ' ')}</span>
                                ))}
                            </div>
                            {data.reassess_in_hours && (
                                <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
                                    <strong>Reassess in:</strong> {data.reassess_in_hours} hours
                                </div>
                            )}
                        </div>
                    )}

                    {/* Phase1b compat (phase2/onc nested) */}
                    {phase1bCompat && (
                        <div className="mini-card">
                            <div className="mini-card-title">Phase1B Compat</div>
                            <div className="chip-row">
                                {phase1bCompat.label_class && <span className="chip muted">{phase1bCompat.label_class}</span>}
                                {phase1bCompat.trajectory && <span className="chip muted">{phase1bCompat.trajectory}</span>}
                                {phase1bCompat.red_flag_triggered && <span className="chip red">Red Flag</span>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 8a) Reviewer Output */}
            {reviewerData && (
                <div className="accordion" style={{ marginTop: 14 }}>
                    <button className="accordion-header" onClick={() => setShowReviewer(!showReviewer)}>
                        <span>Reviewer Output</span>
                        <span>{showReviewer ? '▾' : '▸'}</span>
                    </button>
                    {showReviewer && (
                        <div className="accordion-body">
                            <div className={`reviewer-summary ${reviewerData.confidence < 0.4 ? 'muted' : ''}`}>
                                <strong>Summary:</strong> {reviewerData.reviewer_summary}
                                <div style={{ marginTop: 8, fontSize: '0.85rem' }}>Confidence: {reviewerData.confidence}</div>
                            </div>

                            {reviewerData.contradictions?.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ color: 'var(--red)', fontWeight: 600, fontSize: '0.85rem' }}>Contradictions:</div>
                                    <ul style={{ fontSize: '0.85rem', margin: '4px 0' }}>
                                        {reviewerData.contradictions.map((c, i) => <li key={i}>{c}</li>)}
                                    </ul>
                                </div>
                            )}

                            {reviewerData.missed_red_flags?.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ color: 'var(--amber)', fontWeight: 600, fontSize: '0.85rem' }}>Missed Red Flags:</div>
                                    <ul style={{ fontSize: '0.85rem', margin: '4px 0' }}>
                                        {reviewerData.missed_red_flags.map((c, i) => <li key={i}>{c}</li>)}
                                    </ul>
                                </div>
                            )}

                            <pre style={{ marginTop: 16 }}>{JSON.stringify(reviewerData, null, 2)}</pre>
                        </div>
                    )}
                </div>
            )}

            {/* 8b) Evidence Store */}
            {(reviewerData || rulesData) && (
                <div className="accordion">
                    <button className="accordion-header" onClick={() => setShowEvidence(!showEvidence)}>
                        <span>Evidence Store</span>
                        <span>{showEvidence ? '▾' : '▸'}</span>
                    </button>
                    {showEvidence && (
                        <div className="accordion-body">
                            {rulesData && (
                                <div className="rules-summary" style={{ marginBottom: 16, padding: 12, borderRadius: 4, background: 'rgba(0,0,0,0.03)' }}>
                                    <strong>Rule Sentinel:</strong> {rulesData.triggered ? 'Triggered' : 'Passed'}
                                    {rulesData.skipped_reason && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Note: {rulesData.skipped_reason}</div>}
                                    {rulesData.triggers?.length > 0 && (
                                        <ul style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 8 }}>
                                            {rulesData.triggers.map((t, i) => <li key={i}>{t}</li>)}
                                        </ul>
                                    )}
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                                <button className="btn btn-secondary btn-sm" onClick={onDownloadEvidence}>
                                    Download Evidence JSON
                                </button>
                            </div>
                            <pre>{JSON.stringify({ reviewer_output: reviewerData, rules: rulesData, consensus: consensusStatus, safety_override: safetyOverride }, null, 2)}</pre>
                        </div>
                    )}
                </div>
            )}

            {/* 8c) Parsed JSON */}
            {data && (
                <div className="accordion">
                    <button className="accordion-header" onClick={() => setShowJson(!showJson)}>
                        <span>Parsed JSON</span>
                        <span>{showJson ? '▾' : '▸'}</span>
                    </button>
                    {showJson && (
                        <div className="accordion-body">
                            <pre>{JSON.stringify(data, null, 2)}</pre>
                        </div>
                    )}
                </div>
            )}

            {/* 8d) Raw output */}
            {rawText && (
                <div className="accordion">
                    <button className="accordion-header" onClick={() => setShowRaw(!showRaw)}>
                        <span>Raw Model Output</span>
                        <span>{showRaw ? '▾' : '▸'}</span>
                    </button>
                    {showRaw && (
                        <div className="accordion-body">
                            <pre className="raw-output">{rawText}</pre>
                        </div>
                    )}
                </div>
            )}

            {/* 10) Schema PASS/FAIL */}
            {validation && (
                <div className={`validation-result ${validation.pass ? 'pass' : 'fail'}`}>
                    <span className={`validation-badge ${validation.pass ? 'pass' : 'fail'}`}>
                        Schema: {validation.pass ? 'PASS ✓' : 'FAIL ✗'}
                    </span>
                    {!validation.pass && validation.errors.length > 0 && (
                        <ul className="validation-errors">
                            {validation.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
