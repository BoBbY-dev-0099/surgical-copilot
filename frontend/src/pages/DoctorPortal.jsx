import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    Users, AlertTriangle, ClipboardList, ChevronRight,
    Activity, Thermometer, FileText, Phone,
    Calendar, Zap, MessageSquare, TrendingUp, Clock,
    Heart, Stethoscope, FlaskConical, Mic, Upload, Square,
    Brain, CheckCircle, RefreshCw, RotateCcw, XCircle
} from 'lucide-react';
import { v1Api } from '../api/v1Api';
import { useNotice } from '../context/NoticeContext';
import TimelineChart from '../components/TimelineChart';
import ClinicalOutputCard from '../components/ClinicalOutputCard';
import { usePatientStore } from '../lib/patientStore';
import { storeResult, getResult, resultAge } from '../lib/agentStore';
import { runRuleSentinel } from '../utils/ruleSentinel';
import { runInference as callRealInference, callEnrich } from '../api/inferenceApi';
import ImageUpload from '../components/ImageUpload';

// Generate mock alerts from patients
function generateAlerts(patients) {
    const alerts = [];
    patients.forEach(p => {
        const risk = p.latest_risk_level || 'green';
        if (risk === 'red') {
            alerts.push({
                id: `${p.id}-critical`,
                patientId: p.id,
                patientName: p.name,
                message: 'Critical alert — immediate review required',
                severity: 'high',
                time: 'Just now',
                dot: true,
            });
        }
        if (risk === 'amber') {
            alerts.push({
                id: `${p.id}-amber`,
                patientId: p.id,
                patientName: p.name,
                message: 'Elevated risk indicators — monitoring recommended',
                severity: 'medium',
                time: '2h ago',
            });
        }
    });
    // Add wearable-sourced alerts for post-discharge patients
    patients.filter(p => p.phase === 'phase2').forEach(p => {
        if (p.latest_risk_level === 'red' || p.latest_risk_level === 'amber') {
            alerts.push({
                id: `${p.id}-wearable`,
                patientId: p.id,
                patientName: p.name,
                message: `⌚ Wearable anomaly — ${p.latest_risk_level === 'red' ? 'HR elevated, SpO2 dropping' : 'reduced mobility detected'}`,
                severity: p.latest_risk_level === 'red' ? 'high' : 'medium',
                time: '15m ago',
                isWearable: true,
            });
        }
    });
    return alerts.slice(0, 6);
}

export default function DoctorPortal() {
    const { id } = useParams();
    const { pushNotice } = useNotice();

    // Use patient store for reactive updates
    const {
        patients: storePatients,
        getPatient,
        getResult: getPatientResult,
        resultAge: patientResultAge,
        storeResult: storePatientResult,
        reset: resetPatientStore
    } = usePatientStore();

    const [patients, setPatients] = useState([]);
    const [patientDetail, setPatientDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Overview');

    // Inline inference state
    const [inferenceRunning, setInferenceRunning] = useState(false);
    const [inferenceResult, setInferenceResult] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [uploadedImages, setUploadedImages] = useState([]);
    const [caseTextInitialized, setCaseTextInitialized] = useState(false);

    // MedASR voice input state
    const [voiceMode, setVoiceMode] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [audioUrl, setAudioUrl] = useState(null);
    const voiceRecRef = useRef(null);

    // Sync patients from store
    useEffect(() => {
        // Map store patients to the format expected by the UI
        const mappedPatients = storePatients.map(p => ({
            id: p.id,
            name: p.name,
            age_years: p.age || p.age_years,
            sex: p.sex,
            procedure_name: p.procedure,
            phase: p.phase,
            pod: p.pod || 0,
            latest_risk_level: p.risk,
            lastUpdated: p.addedAt ? new Date(p.addedAt).toLocaleString() : 'Recently',
            summary: p.summary || '',
            redFlags: [],
            // Keep original data for detail view
            _original: p,
        }));
        setPatients(mappedPatients);
        setLoading(false);
    }, [storePatients]);

    useEffect(() => {
        if (id) {
            setLoading(true);
            // First try to get from patient store
            const storePatient = getPatient(id);
            if (storePatient) {
                // Build detail from store patient
                const savedResult = getPatientResult(id);
                setPatientDetail({
                    patient: {
                        id: storePatient.id,
                        name: storePatient.name,
                        age_years: storePatient.age || storePatient.age_years,
                        sex: storePatient.sex,
                        procedure_name: storePatient.procedure,
                        indication: storePatient.indication,
                        phase: storePatient.phase,
                        pod: storePatient.pod || 0,
                        latest_risk_level: storePatient.risk,
                        latest_decision: savedResult?.parsed?.label_class || savedResult?.parsed?.risk_level || 'watch_wait',
                        caseText: storePatient.caseText,
                    },
                    checkins: savedResult ? [{
                        id: `result-${id}`,
                        created_at: savedResult.storedAt || new Date().toISOString(),
                        mode: 'demo',
                        parsed: savedResult.parsed,
                    }] : [],
                    timeline: storePatient.timeline || [],
                    checkinHistory: [],
                    vitals: storePatient.vitals || {},
                    labs: storePatient.labs || {},
                    orders: [],
                    planChecklist: [],
                    followupAppointment: null,
                    notesHistory: [],
                    redFlags: [],
                });
                // Load any saved inference result
                const saved = getResult(id);
                if (saved) setInferenceResult(saved);
                setLoading(false);
            } else {
                // Fallback to API
                v1Api.getPatientDetail(id).then(data => {
                    setPatientDetail(data);
                    const saved = getResult(id);
                    if (saved) setInferenceResult(saved);
                    setLoading(false);
                }).catch(() => setLoading(false));
            }
        } else {
            setPatientDetail(null);
            setInferenceResult(null);
        }
    }, [id, storePatients]);

    const alerts = generateAlerts(patients);
    const stats = {
        monitored: patients.length,
        alertsToday: alerts.filter(a => a.severity === 'high').length,
        pendingReviews: patients.filter(p => p.latest_risk_level === 'amber').length || 1,
    };

    // Pre-fill case text from patient data when patient changes
    useEffect(() => {
        if (patientDetail?.patient && !caseTextInitialized) {
            const p = patientDetail.patient;
            // Use patient's original case text or build from summary/trend
            const defaultCaseText = p.caseText ||
                `${p.age_years || p.age}${p.sex}, POD${p.pod} ${p.procedure_name || p.procedure}. ${p.summary || p.indication || ''}`;
            setNoteText(defaultCaseText);
            setCaseTextInitialized(true);
        }
    }, [patientDetail, caseTextInitialized]);

    // Reset case text initialization when patient changes
    useEffect(() => {
        setCaseTextInitialized(false);
    }, [id]);

    // Handle reset - clears user-added patients but keeps 3 permanent ones
    const handleReset = () => {
        if (window.confirm('Reset all data? This will remove user-added patients but keep the 3 default patients.')) {
            // Clear local AI results storage
            import('../lib/agentStore').then(m => m.clearAll());

            resetPatientStore();
            setInferenceResult(null);
            setNoteText('');
            setVoiceTranscript('');
            pushNotice({
                type: 'info',
                title: 'Reset Complete',
                message: 'User-added patients removed. 3 default patients retained.'
            });
        }
    };

    // MedASR Voice Recording
    const startVoiceRecording = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            pushNotice({ type: 'error', title: 'Not supported', message: 'Use Chrome or Edge for voice input.' });
            return;
        }
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        let accumulated = '';
        rec.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) accumulated += e.results[i][0].transcript + ' ';
                else interim += e.results[i][0].transcript;
            }
            setVoiceTranscript(accumulated + interim);
        };
        rec.onend = () => setIsRecording(false);
        rec.start();
        voiceRecRef.current = rec;
        setIsRecording(true);
    };

    const stopVoiceRecording = () => {
        voiceRecRef.current?.stop();
        setIsRecording(false);
    };

    const handleAudioUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(file));

        // Show loading state
        setVoiceTranscript('Transcribing audio...');
        pushNotice({ type: 'info', title: 'Processing', message: 'Sending audio to MedASR...' });

        try {
            const result = await v1Api.transcribeAudio(file);
            setVoiceTranscript(result.text);

            if (result.mode === 'demo' || result.mode === 'demo-fallback') {
                pushNotice({
                    type: 'info',
                    title: 'MedASR Demo',
                    message: result.error || 'Using demo transcription. Install Whisper for real transcription.'
                });
            } else {
                pushNotice({
                    type: 'success',
                    title: 'Transcription Complete',
                    message: `Processed in ${result.duration_seconds?.toFixed(1)}s using ${result.mode}`
                });
            }
        } catch (err) {
            console.error('MedASR error:', err);
            const p = patientDetail?.patient;
            const sample = `Patient ${p?.name}, Day ${p?.pod || 'X'} post-op. Vitals stable. Temperature 37.2. Pain 4 out of 10. Wound clean, no discharge. Labs pending. Continue current plan.`;
            setVoiceTranscript(sample);
            pushNotice({ type: 'warning', title: 'MedASR Fallback', message: 'Using demo transcription.' });
        }
    };

    // Run inline inference
    const runInference = async () => {
        const p = patientDetail?.patient;
        if (!p) return;

        setInferenceRunning(true);
        setActiveTab('AI Analysis');

        try {
            // Build case text from patient data and notes
            const adapter = p.phase || 'phase1b';
            const caseText = noteText || voiceTranscript || p.caseText ||
                `${p.age}${p.sex}, POD${p.pod} ${p.procedure}. ${p.summary || ''}`;

            // Call real API — no demo fallback
            let inferenceData = null;

            try {
                const apiResult = await callRealInference(adapter, { case_text: caseText });
                if (apiResult.data) {
                    inferenceData = apiResult.data;
                } else {
                    throw new Error(apiResult.error || 'No data returned from inference');
                }
            } catch (err) {
                console.error('Inference failed:', err);
                pushNotice({
                    type: 'error',
                    title: 'Inference Failed',
                    message: `Could not get AI analysis: ${err.message}. Make sure the backend is running.`
                });
                setInferenceRunning(false);
                return;
            }

            // Stage 2: MedGemma 4B enrichment (non-blocking)
            try {
                const imageB64s = uploadedImages.map(img => img.base64);
                const enrichResult = await callEnrich(adapter, inferenceData, caseText, imageB64s);
                if (enrichResult.data && !enrichResult.error) {
                    const e = enrichResult.data;
                    if (e.sbar?.situation) inferenceData.sbar = e.sbar;
                    if (e.followup_questions?.length) inferenceData.followup_questions = e.followup_questions;
                    if (e.evidence?.length) inferenceData.evidence = e.evidence;
                    if (e.patient_message?.summary) inferenceData.patient_message = e.patient_message;
                    if (e.clinical_explanation) inferenceData.clinical_explanation = e.clinical_explanation;
                    if (e.image_analysis) inferenceData.image_analysis = e.image_analysis;
                }
            } catch (err) {
                console.warn('4B enrichment failed (non-blocking):', err);
            }

            // Run rule sentinel
            const sentinel = runRuleSentinel(adapter, {
                temperature: p.lastCheckin?.temperature || 37.0,
                wbc: patientDetail?.labs?.wbc || 8.0,
                pain_score: p.lastCheckin?.pain_score || 3,
            });

            // Build result object
            const result = {
                parsed: inferenceData,
                adapter,
                patientId: p.id,
                patientName: p.name,
                sentinel,
                noteText: noteText || voiceTranscript || null,
                voiceTranscript: voiceTranscript || null,
                uploadedImages: uploadedImages || [],
                checkinData: null, // Will be populated by patient check-ins
                timestamp: new Date().toISOString(),
                mode: 'real',
            };

            // Store in localStorage
            storeResult(p.id, result);
            setInferenceResult(result);

            pushNotice({
                type: 'success',
                title: 'Analysis Complete',
                message: `AI analysis saved for ${p.name}`
            });

        } catch (err) {
            pushNotice({ type: 'error', title: 'Error', message: 'Inference failed.' });
        }

        setInferenceRunning(false);
        setNoteText('');
        setVoiceTranscript('');
    };

    // Show loading spinner while fetching
    if (loading && !id) {
        return <div className="loading-center"><div className="spinner" /></div>;
    }

    // Dashboard view (no patient selected)
    if (!id) {
        return (
            <div className="dashboard-page">
                <div className="dashboard-header">
                    <div>
                        <h1>Patient Monitor</h1>
                        <p>Welcome back, Dr. Vasquez</p>
                    </div>
                    <button
                        className="btn btn-secondary btn-reset"
                        onClick={handleReset}
                        title="Reset to default patients"
                    >
                        <RotateCcw size={16} />
                        Reset
                    </button>
                </div>

                {/* Stats row */}
                <div className="dashboard-stats">
                    <div className="stat-card">
                        <div className="stat-icon"><Users size={20} /></div>
                        <div className="stat-label">Patients monitored</div>
                        <div className="stat-value">{stats.monitored}</div>
                        <div className="stat-sub">Active</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><AlertTriangle size={20} /></div>
                        <div className="stat-label">Alerts today</div>
                        <div className="stat-value">{stats.alertsToday}</div>
                        <div className="stat-sub">Unreviewed</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><ClipboardList size={20} /></div>
                        <div className="stat-label">Pending reviews</div>
                        <div className="stat-value">{stats.pendingReviews}</div>
                        <div className="stat-sub">Check-ins to review</div>
                    </div>
                </div>

                {/* Recent alerts */}
                {alerts.length > 0 && (
                    <div className="dashboard-section">
                        <div className="section-header">
                            <h2>Recent alerts</h2>
                            <span className="section-count">{alerts.length} total</span>
                        </div>
                        <div className="alerts-list">
                            {alerts.map(alert => (
                                <Link
                                    key={alert.id}
                                    to={`/doctor/patient/${alert.patientId}`}
                                    className="alert-row"
                                >
                                    <div className="alert-content">
                                        <div className="alert-patient">
                                            {alert.patientName}
                                            {alert.dot && <span className="alert-dot" />}
                                        </div>
                                        <div className="alert-message">{alert.message}</div>
                                    </div>
                                    <div className="alert-meta">
                                        <span className={`severity-badge severity-${alert.severity}`}>
                                            {alert.severity}
                                        </span>
                                        <span className="alert-time">{alert.time}</span>
                                        <ChevronRight size={18} className="alert-chevron" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* All patients */}
                <div className="dashboard-section">
                    <h2>All Patients</h2>
                    <div className="patients-grid patients-grid--full">
                        {patients.map(p => {
                            const savedResult = getResult(p.id);
                            const age = resultAge(p.id);
                            const risk = p.latest_risk_level || 'green';
                            const riskColor = risk === 'red' ? '#DC2626' : risk === 'amber' ? '#D97706' : '#059669';
                            return (
                                <Link
                                    key={p.id}
                                    to={`/doctor/patient/${p.id}`}
                                    className="patient-card"
                                >
                                    <div className="patient-card-header">
                                        <div className="patient-avatar" style={{ borderColor: riskColor }}>
                                            {p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                        </div>
                                        <div className="patient-info">
                                            <div className="patient-name">{p.name}</div>
                                            <div className="patient-demo">{p.age_years}y • {p.sex === 'M' ? 'Male' : 'Female'}</div>
                                        </div>
                                        <ChevronRight size={20} className="patient-chevron" />
                                    </div>
                                    <div className="patient-tags">
                                        <span className="patient-tag">{p.procedure_name || 'Post-surgical'}</span>
                                        <span className="patient-tag patient-tag--phase">
                                            {p.phase === 'onc' ? 'Oncology' : p.phase === 'phase2' ? 'Post-Discharge' : 'Inpatient'}
                                        </span>
                                    </div>
                                    <div className="patient-footer">
                                        <span className="patient-pod">
                                            <Calendar size={14} />
                                            Day {p.pod || 1}
                                        </span>
                                        {savedResult && (
                                            <span className="patient-ai-badge">
                                                <Brain size={12} />
                                                AI {age}
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // Patient detail view
    const p = patientDetail?.patient;
    const timeline = patientDetail?.timeline || [];

    if (loading) {
        return <div className="loading-center"><div className="spinner" /></div>;
    }

    if (!p) {
        return (
            <div className="empty-state">
                <Users size={48} />
                <h2>Patient not found</h2>
                <Link to="/doctor" className="btn btn-primary">Back to Dashboard</Link>
            </div>
        );
    }

    const riskColor = p.latest_risk_level === 'red' ? '#DC2626' : p.latest_risk_level === 'amber' ? '#D97706' : '#059669';
    const savedAge = resultAge(id);

    return (
        <div className="patient-detail-page">
            {/* Breadcrumb */}
            <div className="detail-breadcrumb">
                <Link to="/doctor">All Patients</Link>
                <ChevronRight size={16} />
                <span>{p.name}</span>
            </div>

            {/* Patient header */}
            <div className="detail-header">
                <div className="detail-header-left">
                    <div className="detail-avatar" style={{ borderColor: riskColor }}>
                        {p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                        <h1>{p.name}</h1>
                        <p>{p.age_years}y {p.sex === 'M' ? 'Male' : 'Female'} • {p.procedure_name} • Day {p.pod || 1} post-op</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="detail-tabs">
                {['Overview', 'AI Analysis', 'Timeline', 'Notes'].map(tab => (
                    <button
                        key={tab}
                        className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                        {tab === 'AI Analysis' && inferenceResult && (
                            <span className="tab-badge">
                                <CheckCircle size={12} />
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="detail-content">
                {activeTab === 'Overview' && (
                    <div className="overview-grid">
                        {/* Vitals card */}
                        <div className="detail-card">
                            <div className="card-header">
                                <Activity size={18} />
                                <h3>Latest Vitals</h3>
                            </div>
                            <div className="vitals-grid">
                                <div className="vital-item">
                                    <Thermometer size={16} />
                                    <span className="vital-label">Temp</span>
                                    <span className="vital-value">{patientDetail?.vitals?.temperature || 36.8}°C</span>
                                </div>
                                <div className="vital-item">
                                    <Heart size={16} />
                                    <span className="vital-label">HR</span>
                                    <span className="vital-value">{patientDetail?.vitals?.hr || 72} bpm</span>
                                </div>
                                <div className="vital-item">
                                    <Activity size={16} />
                                    <span className="vital-label">BP</span>
                                    <span className="vital-value">{patientDetail?.vitals?.bp || '120/80'}</span>
                                </div>
                                <div className="vital-item">
                                    <TrendingUp size={16} />
                                    <span className="vital-label">Pain</span>
                                    <span className="vital-value">{patientDetail?.vitals?.pain || 3}/10</span>
                                </div>
                            </div>
                        </div>

                        {/* Labs card */}
                        <div className="detail-card">
                            <div className="card-header">
                                <FlaskConical size={18} />
                                <h3>Recent Labs</h3>
                            </div>
                            <div className="labs-list">
                                <div className="lab-row">
                                    <span>WBC</span>
                                    <span className="lab-value">{patientDetail?.labs?.wbc || '8.2'} x10⁹/L</span>
                                </div>
                                <div className="lab-row">
                                    <span>CRP</span>
                                    <span className="lab-value">{patientDetail?.labs?.crp || '12'} mg/L</span>
                                </div>
                                <div className="lab-row">
                                    <span>Creatinine</span>
                                    <span className="lab-value">{patientDetail?.labs?.creatinine || '0.9'} mg/dL</span>
                                </div>
                            </div>
                        </div>

                        {/* Quick AI Analysis card */}
                        <div className="detail-card">
                            <div className="card-header">
                                <Brain size={18} />
                                <h3>AI Analysis</h3>
                            </div>
                            {inferenceResult ? (
                                <div className="ai-status ai-status--complete">
                                    <CheckCircle size={20} />
                                    <div>
                                        <strong>Analysis available</strong>
                                        <span>{savedAge}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="ai-status ai-status--pending">
                                    <Clock size={20} />
                                    <span>No analysis yet</span>
                                </div>
                            )}
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', marginTop: 12 }}
                                onClick={() => setActiveTab('AI Analysis')}
                            >
                                <Zap size={16} />
                                {inferenceResult ? 'View / Re-run Analysis' : 'Run AI Analysis'}
                            </button>
                        </div>

                        {/* Quick actions */}
                        <div className="detail-card">
                            <div className="card-header">
                                <Stethoscope size={18} />
                                <h3>Quick Actions</h3>
                            </div>
                            <div className="actions-list">
                                <button className="action-btn">
                                    <Phone size={16} />
                                    Call Patient
                                </button>
                                <button className="action-btn">
                                    <Calendar size={16} />
                                    Schedule Follow-up
                                </button>
                                <button className="action-btn">
                                    <FileText size={16} />
                                    Generate Report
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'AI Analysis' && (
                    <div className="overview-grid">
                        {/* Previous Result section - shown first if available */}
                        {inferenceResult && !inferenceRunning && (
                            <div className="detail-card detail-card--wide">
                                <div className="card-header">
                                    <CheckCircle size={18} style={{ color: '#059669' }} />
                                    <h3>Previous AI Analysis Result</h3>
                                    <span className="card-badge">{savedAge}</span>
                                </div>

                                {/* HITL Gate Section */}
                                {inferenceResult.hitlGate && (
                                    <div className={`hitl-gate-section ${inferenceResult.hitlGate.required ? 'hitl-required' : 'hitl-cleared'}`}>
                                        <div className="hitl-gate-header">
                                            <div className="hitl-gate-icon">
                                                {inferenceResult.hitlGate.required ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                                            </div>
                                            <div className="hitl-gate-info">
                                                <div className="hitl-gate-title">
                                                    Human-in-the-Loop Gate
                                                    {inferenceResult.hitlGate.priority && (
                                                        <span className={`hitl-priority hitl-priority--${inferenceResult.hitlGate.priority}`}>
                                                            {inferenceResult.hitlGate.priority.toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="hitl-gate-reason">
                                                    {inferenceResult.hitlGate.reason ||
                                                        (inferenceResult.hitlGate.required
                                                            ? 'Critical decision — clinician confirmation required before sending.'
                                                            : 'Auto-cleared — no critical flags detected.')}
                                                </div>
                                            </div>
                                        </div>
                                        {inferenceResult.hitlGate.required && (
                                            <div className="hitl-gate-notice">
                                                <span>SBAR will only be sent after human approval.</span>
                                                <span className="hitl-gate-status">gate_passed={String(inferenceResult.hitlGate.gate_passed || false)}</span>
                                            </div>
                                        )}
                                        {inferenceResult.hitlGate.required && (
                                            <div className="hitl-gate-actions">
                                                <button
                                                    className="btn btn-success btn-sm"
                                                    onClick={async () => {
                                                        try {
                                                            await v1Api.submitHitlDecision({
                                                                patient_id: p.id,
                                                                decision: 'approve',
                                                                original_risk: inferenceResult.parsed?.risk_level || inferenceResult.parsed?.label_class || 'unknown',
                                                                clinician_name: 'Dr. Vasquez',
                                                                rationale: 'Approved after clinical review',
                                                            });
                                                            setInferenceResult(prev => ({
                                                                ...prev,
                                                                hitlGate: { ...prev.hitlGate, gate_passed: true, required: false }
                                                            }));
                                                            pushNotice({ type: 'success', title: 'HITL Approved', message: 'Decision recorded. SBAR will be sent.' });
                                                        } catch (err) {
                                                            pushNotice({ type: 'error', title: 'Error', message: 'Failed to record decision.' });
                                                        }
                                                    }}
                                                >
                                                    <CheckCircle size={14} /> Approve & Send
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={async () => {
                                                        try {
                                                            await v1Api.submitHitlDecision({
                                                                patient_id: p.id,
                                                                decision: 'reject',
                                                                original_risk: inferenceResult.parsed?.risk_level || inferenceResult.parsed?.label_class || 'unknown',
                                                                clinician_name: 'Dr. Vasquez',
                                                                rationale: 'Rejected - clinical judgment differs',
                                                            });
                                                            setInferenceResult(prev => ({
                                                                ...prev,
                                                                hitlGate: { ...prev.hitlGate, gate_passed: false, rejected: true }
                                                            }));
                                                            pushNotice({ type: 'info', title: 'HITL Rejected', message: 'Decision recorded. SBAR will NOT be sent.' });
                                                        } catch (err) {
                                                            pushNotice({ type: 'error', title: 'Error', message: 'Failed to record decision.' });
                                                        }
                                                    }}
                                                >
                                                    <XCircle size={14} /> Do Not Send
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Patient Check-in Data Section - BEFORE AI Analysis */}
                                {inferenceResult.checkinData && (
                                    <div className="checkin-data-section">
                                        <h4>📋 Patient Check-in Data</h4>
                                        <div className="checkin-data-grid">
                                            {/* Vitals */}
                                            <div className="checkin-vitals-card">
                                                <h5>Vital Signs</h5>
                                                <div className="vital-items">
                                                    {inferenceResult.checkinData.pain_score !== undefined && (
                                                        <div className="vital-row">
                                                            <span className="vital-label">Pain Level:</span>
                                                            <span className="vital-value">{inferenceResult.checkinData.pain_score}/10</span>
                                                        </div>
                                                    )}
                                                    {inferenceResult.checkinData.temperature && (
                                                        <div className="vital-row">
                                                            <span className="vital-label">Temperature:</span>
                                                            <span className="vital-value">{inferenceResult.checkinData.temperature}°C</span>
                                                        </div>
                                                    )}
                                                    {inferenceResult.checkinData.mobility && (
                                                        <div className="vital-row">
                                                            <span className="vital-label">Mobility:</span>
                                                            <span className="vital-value">{inferenceResult.checkinData.mobility}</span>
                                                        </div>
                                                    )}
                                                    {inferenceResult.checkinData.appetite && (
                                                        <div className="vital-row">
                                                            <span className="vital-label">Appetite:</span>
                                                            <span className="vital-value">{inferenceResult.checkinData.appetite}</span>
                                                        </div>
                                                    )}
                                                    {inferenceResult.checkinData.nausea_vomiting !== undefined && (
                                                        <div className="vital-row">
                                                            <span className="vital-label">Nausea/Vomiting:</span>
                                                            <span className="vital-value">{inferenceResult.checkinData.nausea_vomiting ? 'Yes' : 'No'}</span>
                                                        </div>
                                                    )}
                                                    {inferenceResult.checkinData.wound_concerns && (
                                                        <div className="vital-row">
                                                            <span className="vital-label">Wound Concerns:</span>
                                                            <span className="vital-value">{inferenceResult.checkinData.wound_concerns}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Wound Images */}
                                            {inferenceResult.uploadedImages?.length > 0 && (
                                                <div className="checkin-images-card">
                                                    <h5>📷 Wound Photos ({inferenceResult.uploadedImages.length})</h5>
                                                    <div className="checkin-images-grid">
                                                        {inferenceResult.uploadedImages.map((img, i) => (
                                                            <div key={i} className="checkin-image-item">
                                                                <img src={img.preview || img.base64 ? `data:image/png;base64,${img.base64}` : img} alt={`Wound ${i + 1}`} />
                                                                <div className="checkin-image-meta">
                                                                    <span>Submitted by patient</span>
                                                                    <span>{new Date(inferenceResult.timestamp).toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Voice Transcript */}
                                        {inferenceResult.voiceTranscript && (
                                            <div className="checkin-voice-section">
                                                <h5>🎤 Patient Voice Notes (MedASR)</h5>
                                                <div className="voice-transcript-box">
                                                    {inferenceResult.voiceTranscript}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <ClinicalOutputCard
                                    data={inferenceResult.parsed}
                                    adapter={p.phase || 'phase1b'}
                                />

                                {/* Inference Details */}
                                <div className="inference-details">
                                    <h4>Inference Details</h4>
                                    <div className="inference-meta-grid">
                                        <div className="meta-item">
                                            <span className="meta-label">Mode</span>
                                            <span className={`meta-value mode-${inferenceResult.mode || 'demo'}`}>
                                                {inferenceResult.mode === 'real' ? 'AWS SageMaker' : 'Demo Mode'}
                                            </span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">Adapter</span>
                                            <span className="meta-value">{inferenceResult.adapter || p.phase || 'phase1b'}</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">Model</span>
                                            <span className="meta-value">MedGemma 27B</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">Decision</span>
                                            <span className="meta-value">{inferenceResult.decision || inferenceResult.parsed?.label_class || inferenceResult.parsed?.risk_level || 'N/A'}</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">Tools Used</span>
                                            <span className="meta-value">{(inferenceResult.toolsUsed || []).join(', ') || 'N/A'}</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">Timestamp</span>
                                            <span className="meta-value">
                                                {inferenceResult.timestamp ? new Date(inferenceResult.timestamp).toLocaleString() : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Agent State Section */}
                                {inferenceResult.agentState && (
                                    <div className="agent-state-section">
                                        <h4>Agent State</h4>
                                        <div className="agent-state-grid">
                                            {inferenceResult.agentState.final_action && (
                                                <div className="state-item">
                                                    <span className="state-label">Final Action</span>
                                                    <span className="state-value">{inferenceResult.agentState.final_action}</span>
                                                </div>
                                            )}
                                            {inferenceResult.agentState.next_step && (
                                                <div className="state-item state-item--wide">
                                                    <span className="state-label">Next Step</span>
                                                    <span className="state-value">
                                                        {inferenceResult.agentState.next_step.instruction}
                                                        {inferenceResult.agentState.next_step.timeframe && ` (${inferenceResult.agentState.next_step.timeframe})`}
                                                    </span>
                                                </div>
                                            )}
                                            {inferenceResult.agentState.safety_gates_triggered?.length > 0 && (
                                                <div className="state-item state-item--wide">
                                                    <span className="state-label">Safety Gates</span>
                                                    <div className="state-chips">
                                                        {inferenceResult.agentState.safety_gates_triggered.map((gate, i) => (
                                                            <span key={i} className="state-chip state-chip--warning">{gate}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Clinical Baselines Section (NEWS2, Sepsis) - from agent response or from parsed (direct /api/phase1b) */}
                                {(() => {
                                    const baselines = inferenceResult.clinical_baselines || (inferenceResult.parsed && (inferenceResult.parsed.news2 || inferenceResult.parsed.sepsis_screen) ? {
                                        news2: inferenceResult.parsed.news2,
                                        sepsis_screen: inferenceResult.parsed.sepsis_screen,
                                        extracted_vitals: inferenceResult.parsed.extracted_vitals,
                                        extracted_labs: inferenceResult.parsed.extracted_labs,
                                    } : null);
                                    return baselines && (baselines.news2 || baselines.sepsis_screen) ? (
                                        <div className="clinical-baselines-section">
                                            <h4>Clinical Baselines (Standardized Scores)</h4>
                                            <div className="baselines-grid">
                                                {/* NEWS2 Score */}
                                                {baselines.news2 && (
                                                    <div className={`baseline-card baseline-card--${baselines.news2.news2_risk_band || 'low'}`}>
                                                        <div className="baseline-header">
                                                            <span className="baseline-title">NEWS2</span>
                                                            <span className="baseline-score">{baselines.news2.news2_score ?? 'N/A'}</span>
                                                        </div>
                                                        <div className="baseline-risk-band">
                                                            Risk: <strong>{baselines.news2.news2_risk_band?.toUpperCase() || 'N/A'}</strong>
                                                        </div>
                                                        <div className="baseline-response">
                                                            {baselines.news2.news2_clinical_response}
                                                        </div>
                                                        {baselines.news2.news2_components && (
                                                            <div className="baseline-components">
                                                                {Object.entries(baselines.news2.news2_components).map(([key, val]) => (
                                                                    <span key={key} className={`component-chip component-chip--${val >= 3 ? 'critical' : val >= 1 ? 'warning' : 'normal'}`}>
                                                                        {key}: {val}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Sepsis Screening */}
                                                {baselines.sepsis_screen && (
                                                    <div className={`baseline-card baseline-card--${baselines.sepsis_screen.sepsis_likelihood || 'low'}`}>
                                                        <div className="baseline-header">
                                                            <span className="baseline-title">Sepsis Screen</span>
                                                            <span className="baseline-score">qSOFA {baselines.sepsis_screen.qsofa_score ?? 0}/3</span>
                                                        </div>
                                                        <div className="baseline-risk-band">
                                                            Likelihood: <strong>{baselines.sepsis_screen.sepsis_likelihood?.toUpperCase() || 'LOW'}</strong>
                                                        </div>
                                                        <div className="baseline-response">
                                                            {baselines.sepsis_screen.sepsis_action}
                                                        </div>
                                                        {baselines.sepsis_screen.qsofa_criteria_met?.length > 0 && (
                                                            <div className="baseline-criteria">
                                                                <strong>Criteria met:</strong>
                                                                <ul>
                                                                    {baselines.sepsis_screen.qsofa_criteria_met.map((c, i) => (
                                                                        <li key={i}>{c}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Extracted Vitals */}
                                            {baselines.extracted_vitals && Object.keys(baselines.extracted_vitals).length > 0 && (
                                                <div className="extracted-data-section">
                                                    <h5>Extracted Vitals</h5>
                                                    <div className="extracted-chips">
                                                        {Object.entries(baselines.extracted_vitals).map(([key, val]) => (
                                                            <span key={key} className="extracted-chip">
                                                                {key.replace(/_/g, ' ')}: <strong>{val}</strong>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : null;
                                })()}

                                {/* Wearable Analysis Section (Phase 2) */}
                                {inferenceResult.parsed?.wearable_analysis?.wearable_data_available && (
                                    <div className="wearable-analysis-section">
                                        <h4>Wearable / Passive Signal Analysis</h4>
                                        <div className={`wearable-risk-banner wearable-risk--${inferenceResult.parsed.wearable_analysis.wearable_risk_level || 'normal'}`}>
                                            <span className="wearable-risk-label">Passive Signal Risk:</span>
                                            <span className="wearable-risk-value">{inferenceResult.parsed.wearable_analysis.wearable_risk_level?.toUpperCase() || 'NORMAL'}</span>
                                        </div>
                                        <p className="wearable-action">{inferenceResult.parsed.wearable_analysis.wearable_action}</p>

                                        {/* Signal Values */}
                                        {inferenceResult.parsed.wearable_analysis.signals && Object.keys(inferenceResult.parsed.wearable_analysis.signals).length > 0 && (
                                            <div className="wearable-signals-grid">
                                                {Object.entries(inferenceResult.parsed.wearable_analysis.signals).map(([key, data]) => (
                                                    <div key={key} className="wearable-signal-card">
                                                        <div className="signal-name">{key.replace(/_/g, ' ')}</div>
                                                        <div className="signal-value">{data.value} {data.unit || ''}</div>
                                                        {data.baseline && <div className="signal-baseline">Baseline: {data.baseline}</div>}
                                                        {data.pct_change && <div className={`signal-change ${data.pct_change < 0 ? 'negative' : 'positive'}`}>{data.pct_change > 0 ? '+' : ''}{data.pct_change}%</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Deviations */}
                                        {inferenceResult.parsed.wearable_analysis.deviations?.length > 0 && (
                                            <div className="wearable-deviations">
                                                <h5>Detected Deviations</h5>
                                                {inferenceResult.parsed.wearable_analysis.deviations.map((dev, i) => (
                                                    <div key={i} className={`deviation-item deviation--${dev.severity}`}>
                                                        <span className="deviation-signal">{dev.signal}</span>
                                                        <span className="deviation-finding">{dev.finding}</span>
                                                        <span className="deviation-concern">{dev.clinical_concern}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <p className="wearable-note">{inferenceResult.parsed.wearable_analysis.clinical_note}</p>
                                    </div>
                                )}

                                {/* Fused Risk (Phase 2) */}
                                {inferenceResult.parsed?.fused_risk?.risk_upgraded && (
                                    <div className="fused-risk-alert">
                                        <AlertTriangle size={16} />
                                        <span>Risk upgraded from {inferenceResult.parsed.fused_risk.self_reported_risk?.toUpperCase()} to {inferenceResult.parsed.fused_risk.fused_risk_level?.toUpperCase()}</span>
                                        <span className="fused-risk-reason">{inferenceResult.parsed.fused_risk.upgrade_reason}</span>
                                    </div>
                                )}

                                {/* NCCN Guideline Followup (Oncology) */}
                                {inferenceResult.parsed?.guideline_followup && (
                                    <div className="nccn-followup-section">
                                        <h4>NCCN Guideline-Aware Follow-up</h4>
                                        <div className={`nccn-urgency-banner nccn-urgency--${inferenceResult.parsed.guideline_followup.urgency || 'routine'}`}>
                                            Urgency: <strong>{inferenceResult.parsed.guideline_followup.urgency?.toUpperCase() || 'ROUTINE'}</strong>
                                        </div>
                                        <div className="nccn-schedule-grid">
                                            {inferenceResult.parsed.guideline_followup.cea && (
                                                <div className="nccn-item">
                                                    <span className="nccn-label">CEA</span>
                                                    <span className="nccn-timing">{inferenceResult.parsed.guideline_followup.cea.timing}</span>
                                                    <span className="nccn-rationale">{inferenceResult.parsed.guideline_followup.cea.rationale}</span>
                                                </div>
                                            )}
                                            {inferenceResult.parsed.guideline_followup.imaging && (
                                                <div className="nccn-item">
                                                    <span className="nccn-label">Imaging</span>
                                                    <span className="nccn-timing">{inferenceResult.parsed.guideline_followup.imaging.timing}</span>
                                                    <span className="nccn-rationale">{inferenceResult.parsed.guideline_followup.imaging.rationale}</span>
                                                </div>
                                            )}
                                            {inferenceResult.parsed.guideline_followup.oncology_review && (
                                                <div className="nccn-item">
                                                    <span className="nccn-label">Oncology Review</span>
                                                    <span className="nccn-timing">{inferenceResult.parsed.guideline_followup.oncology_review.timing}</span>
                                                    <span className="nccn-rationale">{inferenceResult.parsed.guideline_followup.oncology_review.rationale}</span>
                                                </div>
                                            )}
                                        </div>
                                        {inferenceResult.parsed.guideline_followup.nccn_reference && (
                                            <p className="nccn-reference">{inferenceResult.parsed.guideline_followup.nccn_reference}</p>
                                        )}
                                    </div>
                                )}

                                {/* Structured Audit / Rationale Codes */}
                                {inferenceResult.parsed?.structured_audit && (
                                    <div className="rationale-codes-section">
                                        <h4>Structured Audit Trail</h4>
                                        <p className="rationale-note">Deterministic provenance — links model adapter, input hash, and validation status</p>
                                        <div className="audit-grid">
                                            <div className="audit-row"><span className="audit-key">Model Adapter</span><span className="audit-val">{inferenceResult.parsed.structured_audit.model_adapter}</span></div>
                                            <div className="audit-row"><span className="audit-key">Case Hash</span><span className="audit-val" style={{ fontFamily: 'monospace' }}>{inferenceResult.parsed.structured_audit.case_hash}</span></div>
                                            <div className="audit-row"><span className="audit-key">Red Flags Checked</span><span className="audit-val">{inferenceResult.parsed.structured_audit.red_flags_checked ? '✓ Yes' : '✗ No'}</span></div>
                                            <div className="audit-row"><span className="audit-key">Schema Valid</span><span className="audit-val">{inferenceResult.parsed.structured_audit.schema_valid ? '✓ Yes' : '✗ No'}</span></div>
                                        </div>
                                    </div>
                                )}
                                {inferenceResult.rationale_codes?.length > 0 && (
                                    <div className="rationale-codes-section">
                                        <h4>Clinical Rationale Codes</h4>
                                        <p className="rationale-note">Structured codes replace free-text reasoning for safer audit trails</p>
                                        <div className="rationale-chips">
                                            {inferenceResult.rationale_codes.map((code, i) => (
                                                <span key={i} className="rationale-chip">{code}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* SBAR Section */}
                                {inferenceResult.sbar && (inferenceResult.sbar.situation || inferenceResult.sbar.background) && (
                                    <div className="sbar-display-section">
                                        <h4>SBAR Escalation Report</h4>
                                        <div className="sbar-display-grid">
                                            {['situation', 'background', 'assessment', 'recommendation'].map(key => (
                                                inferenceResult.sbar[key] && (
                                                    <div key={key} className="sbar-display-row">
                                                        <div className="sbar-display-label">
                                                            <span className="sbar-letter-badge">{key[0].toUpperCase()}</span>
                                                            {key.charAt(0).toUpperCase() + key.slice(1)}
                                                        </div>
                                                        <div className="sbar-display-value">{inferenceResult.sbar[key]}</div>
                                                    </div>
                                                )
                                            ))}
                                        </div>
                                        {inferenceResult.reviewedBy && (
                                            <div className="sbar-reviewed-by">
                                                Reviewed by {inferenceResult.reviewedBy} on {new Date(inferenceResult.reviewedAt).toLocaleString()}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Patient Message Section */}
                                {inferenceResult.patientMessage && (inferenceResult.patientMessage.summary || inferenceResult.patientMessage.self_care?.length > 0) && (
                                    <div className="patient-msg-display-section">
                                        <h4>Patient Message (Sent to Patient Portal)</h4>
                                        {inferenceResult.patientMessage.summary && (
                                            <div className="patient-msg-summary">
                                                {inferenceResult.patientMessage.summary}
                                            </div>
                                        )}
                                        {inferenceResult.patientMessage.self_care?.length > 0 && (
                                            <div className="patient-msg-instructions">
                                                <strong>Self-Care Instructions:</strong>
                                                <ul>
                                                    {inferenceResult.patientMessage.self_care.map((item, i) => (
                                                        <li key={i}>{item}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {inferenceResult.patientMessage.next_checkin && (
                                            <div className="patient-msg-checkin">
                                                <Clock size={14} />
                                                Next check-in: {inferenceResult.patientMessage.next_checkin}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Case Text Section */}
                                {(inferenceResult.noteText || inferenceResult.caseText) && (
                                    <div className="result-note">
                                        <strong>Input Case Text:</strong>
                                        <p>{inferenceResult.noteText || inferenceResult.caseText}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Input section */}
                        <div className="detail-card detail-card--wide">
                            <div className="card-header">
                                <Brain size={18} />
                                <h3>Run AI Inference</h3>
                                <div className="input-toggle">
                                    <button className={!voiceMode ? 'active' : ''} onClick={() => setVoiceMode(false)}>
                                        <FileText size={14} /> Text
                                    </button>
                                    <button className={voiceMode ? 'active' : ''} onClick={() => setVoiceMode(true)}>
                                        <Mic size={14} /> Voice
                                    </button>
                                </div>
                            </div>

                            {voiceMode ? (
                                <div className="voice-panel">
                                    <div className="voice-tip">
                                        <Mic size={18} style={{ color: '#14B8A6' }} />
                                        <div>
                                            <strong>MedASR Voice Input</strong>
                                            <p>Dictate clinical notes — vitals, symptoms, observations. The AI will analyze the full patient context.</p>
                                        </div>
                                    </div>

                                    <div className="voice-controls">
                                        <label className="upload-btn">
                                            <Upload size={16} />
                                            Upload Audio
                                            <input type="file" accept="audio/*" onChange={handleAudioUpload} hidden />
                                        </label>
                                        {!isRecording ? (
                                            <button className="btn btn-secondary" onClick={startVoiceRecording}>
                                                <Mic size={16} /> Start Recording
                                            </button>
                                        ) : (
                                            <button className="btn btn-danger" onClick={stopVoiceRecording}>
                                                <Square size={16} /> Stop
                                            </button>
                                        )}
                                    </div>

                                    {isRecording && (
                                        <div className="recording-indicator">
                                            <span className="recording-dot" />
                                            Listening... speak clearly
                                        </div>
                                    )}

                                    {audioUrl && (
                                        <audio src={audioUrl} controls style={{ width: '100%', marginTop: 12 }} />
                                    )}

                                    {voiceTranscript && (
                                        <div className="transcript-box">
                                            <label>Transcription (editable):</label>
                                            <textarea
                                                value={voiceTranscript}
                                                onChange={e => setVoiceTranscript(e.target.value)}
                                                rows={4}
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="note-input-section">
                                    <label className="input-label">Case Text (pre-filled from patient data)</label>
                                    <textarea
                                        className="note-textarea"
                                        placeholder="Patient case text for AI analysis..."
                                        value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        rows={6}
                                    />
                                </div>
                            )}

                            <ImageUpload
                                images={uploadedImages}
                                onChange={setUploadedImages}
                                disabled={inferenceRunning}
                                compact
                            />

                            <div className="inference-actions">
                                <div className="inference-info">
                                    <span>Adapter: <strong>{p.phase === 'onc' ? 'Oncology' : p.phase === 'phase2' ? 'SAFEGUARD' : 'Phase 1'}</strong></span>
                                    <span>Model: <strong>MedGemma 27B + 4B</strong></span>
                                </div>
                                <button
                                    className={`btn btn-primary ${inferenceRunning ? 'loading' : ''}`}
                                    onClick={runInference}
                                    disabled={inferenceRunning}
                                >
                                    {inferenceRunning ? (
                                        <>
                                            <RefreshCw size={16} className="spin" />
                                            Running Analysis...
                                        </>
                                    ) : (
                                        <>
                                            <Zap size={16} />
                                            Run AI Analysis
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {inferenceRunning && (
                            <div className="detail-card detail-card--wide">
                                <div className="inference-progress">
                                    <div className="spinner" />
                                    <div>
                                        <strong>Running AI Analysis...</strong>
                                        <p>Processing clinical context with MedGemma 27B + {p.phase === 'onc' ? 'Oncology' : p.phase === 'phase2' ? 'SAFEGUARD' : 'Phase 1'} adapter</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Timeline' && (
                    <div className="detail-card detail-card--full">
                        {timeline.length > 0 ? (
                            <TimelineChart
                                data={timeline}
                                metrics={['pain', 'temp', 'wbc']}
                                title={`${p.name} — Clinical Trend`}
                            />
                        ) : (
                            <div className="empty-state-sm">
                                <Clock size={32} />
                                <p>No timeline data available</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Notes' && (
                    <div className="detail-card detail-card--full">
                        <div className="notes-section">
                            <textarea
                                className="notes-input"
                                placeholder="Add a clinical note..."
                                rows={4}
                            />
                            <button className="btn btn-primary btn-sm">Add Note</button>
                        </div>
                        <div className="notes-list">
                            {(patientDetail?.notesHistory || []).map((note, i) => (
                                <div key={i} className="note-item">
                                    <div className="note-header">
                                        <span className="note-author">{note.author}</span>
                                        <span className="note-time">{new Date(note.at).toLocaleDateString()}</span>
                                    </div>
                                    <p className="note-content">{note.summary}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
