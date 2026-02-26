import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    Heart, Thermometer, Activity, TrendingUp,
    Calendar, FileText, MessageSquare, ChevronRight,
    Mic, Upload, Square, CheckCircle, AlertCircle,
    Clock, Utensils, Footprints, User, Watch, Wifi, WifiOff,
    AlertTriangle, Zap
} from 'lucide-react';
import { v1Api } from '../api/v1Api';
import { useNotice } from '../context/NoticeContext';
import TimelineChart from '../components/TimelineChart';
import ClinicalOutputCard from '../components/ClinicalOutputCard';
import { usePatientStore } from '../lib/patientStore';
import patientStore from '../lib/patientStore';

const PATIENT_TABS = ['Recovery Hub', 'Daily Check-in', 'Wearable', 'Trends', 'Care Plan'];

const RISK_CONFIG = {
    red: { color: '#DC2626', bg: '#FEE2E2', label: 'Critical', text: 'Your recovery needs urgent attention.' },
    amber: { color: '#D97706', bg: '#FEF3C7', label: 'Monitoring', text: 'Your recovery needs closer watching today.' },
    green: { color: '#059669', bg: '#D1FAE5', label: 'On Track', text: 'Your recovery is going well!' },
};

function PainScale({ value, onChange }) {
    return (
        <div className="pain-scale">
            <div className="pain-track">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <button
                        key={n}
                        className={`pain-dot ${value === n ? 'active' : ''} ${n <= 3 ? 'low' : n <= 6 ? 'med' : 'high'}`}
                        onClick={() => onChange(n)}
                    >
                        {n}
                    </button>
                ))}
            </div>
            <div className="pain-labels">
                <span>No pain</span>
                <span>Worst pain</span>
            </div>
        </div>
    );
}

export default function PatientPortal() {
    const { id } = useParams();
    const { pushNotice } = useNotice();

    // Use patient store for reactive updates
    const {
        patients: storePatients,
        getPatient,
        getResult: getPatientResult
    } = usePatientStore();

    const [patients, setPatients] = useState([]);
    const [patientDetail, setPatientDetail] = useState(null);
    const [activeTab, setActiveTab] = useState('Recovery Hub');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [checkinResult, setCheckinResult] = useState(null);

    const [wearableSummary, setWearableSummary] = useState(null);
    const [wearableSimulating, setWearableSimulating] = useState(false);
    const [wearableScenario, setWearableScenario] = useState('normal');
    const [wearableHistory, setWearableHistory] = useState([]);
    const [wearableAutoSync, setWearableAutoSync] = useState(false);

    // Auto-sync interval
    useEffect(() => {
        let interval;
        if (wearableAutoSync && id) {
            // Initial sync
            const sync = async () => {
                try {
                    const result = await v1Api.simulateWearable(id, wearableScenario, 'apple_watch');
                    if (result.readings) {
                        setWearableHistory(prev => [...prev, { ...result, time: new Date().toLocaleTimeString() }].slice(-20));
                    }
                    const summary = await v1Api.getWearableSummary(id);
                    setWearableSummary(summary);
                    if (result.anomalies?.length > 0) {
                        pushNotice({ type: 'warning', message: `Wearable alert: ${result.anomalies.length} anomaly detected` });
                    }
                } catch (e) {
                    console.error('Auto-sync error:', e);
                }
            };

            sync();
            interval = setInterval(sync, 5000); // Sync every 5 seconds
        }
        return () => clearInterval(interval);
    }, [wearableAutoSync, id, wearableScenario]);

    const [checkin, setCheckin] = useState({
        pain_score: 3,
        temperature: 36.8,
        nausea_vomiting: false,
        bowel_function: true,
        appetite: 'good',
        wound_concerns: 'none',
        mobility: 'normal',
        wound_image: null,
    });

    // Voice input state (MedASR)
    const [voiceMode, setVoiceMode] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [audioUrl, setAudioUrl] = useState(null);
    const voiceRecRef = useRef(null);

    // Sync patients from store
    useEffect(() => {
        const mappedPatients = storePatients.map(p => ({
            id: p.id,
            name: p.name,
            age_years: p.age,
            sex: p.sex,
            procedure_name: p.procedure,
            phase: p.phase,
            pod: p.pod,
            latest_risk_level: p.risk,
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
                const savedResult = getPatientResult(id);
                setPatientDetail({
                    patient: {
                        id: storePatient.id,
                        name: storePatient.name,
                        age_years: storePatient.age,
                        sex: storePatient.sex,
                        procedure_name: storePatient.procedure,
                        indication: storePatient.indication,
                        phase: storePatient.phase,
                        pod: storePatient.pod,
                        latest_risk_level: storePatient.risk,
                    },
                    checkins: savedResult ? [{
                        id: `result-${id}`,
                        created_at: savedResult.storedAt || new Date().toISOString(),
                        mode: 'demo',
                        parsed: savedResult.parsed,
                    }] : [],
                    timeline: storePatient.timeline || [],
                    checkinHistory: [],
                    planChecklist: [],
                });
                setLoading(false);
            } else {
                // Fallback to API
                v1Api.getPatientDetail(id).then(data => {
                    setPatientDetail(data);
                    setLoading(false);
                }).catch(() => setLoading(false));
            }
        }
    }, [id, storePatients]);

    const pt = patientDetail?.patient;
    const rc = RISK_CONFIG[pt?.latest_risk_level || 'green'] || RISK_CONFIG.green;
    const timeline = patientDetail?.timeline || [];
    const checkinHistory = patientDetail?.checkinHistory || [];

    const handleSubmitCheckin = async () => {
        setSubmitting(true);
        try {
            await new Promise(r => setTimeout(r, 1500));

            // Extract base64 from data URL if present
            let imageB64 = null;
            if (checkin.wound_image && checkin.wound_image.startsWith('data:image')) {
                imageB64 = checkin.wound_image.split(',')[1]; // Remove "data:image/png;base64," prefix
            }

            const result = await v1Api.submitCheckIn(id, {
                daily_checkin: checkin,
                case_text: `Patient ${pt?.name} Day ${pt?.pod || 'N/A'} check-in: Pain ${checkin.pain_score}/10, Temp ${checkin.temperature}°C. ${voiceTranscript || ''}`,
                images: imageB64 ? [imageB64] : [], // Include wound image for 4B analysis
            });
            setCheckinResult(result?.parsed);

            // Store full result with checkinData and images in patient store
            const storePatient = usePatientStore.getState ? usePatientStore.getState() : { storeResult: patientStore.storeResult };
            if (result?.parsed) {
                const fullResult = {
                    parsed: result.parsed,
                    patientMessage: result.parsed.patient_message,
                    checkinData: checkin,
                    uploadedImages: imageB64 ? [{ base64: imageB64, preview: checkin.wound_image }] : [],
                    voiceTranscript: voiceTranscript || null,
                    timestamp: new Date().toISOString(),
                    storedAt: new Date().toISOString(),
                    reviewedAt: new Date().toISOString(),
                    adapter: pt?.phase || 'phase2',
                };
                try {
                    patientStore.storeResult(id, fullResult);
                } catch (e) {
                    console.warn('Failed to store checkin result:', e);
                }
            }

            pushNotice({ type: 'info', title: 'Check-in Complete', message: 'AI analysis updated.' });
            setActiveTab('Recovery Hub');
        } catch {
            pushNotice({ type: 'error', title: 'Error', message: 'Could not submit check-in.' });
        }
        setSubmitting(false);
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
                    message: result.error || 'Using demo transcription.'
                });
            } else {
                pushNotice({
                    type: 'success',
                    title: 'Transcription Complete',
                    message: `Processed in ${result.duration_seconds?.toFixed(1)}s`
                });
            }
        } catch (err) {
            console.error('MedASR error:', err);
            setVoiceTranscript(`[MedASR Fetch Error]: ${err.message}. Please check network or H100 backend logs.`);
            pushNotice({ type: 'error', title: 'MedASR Fallback', message: err.message });
        }
    };

    // Loading state
    if (loading && !id) {
        return <div className="loading-center"><div className="spinner" /></div>;
    }

    // Patient selection screen - show ALL patients as cards
    if (!id) {
        return (
            <div className="dashboard-page">
                <div className="dashboard-header">
                    <h1>Patient Check-in</h1>
                    <p>Select your profile to access your recovery dashboard and daily check-in</p>
                </div>

                <div className="patients-grid patients-grid--full">
                    {patients.map(p => {
                        const risk = p.latest_risk_level || 'green';
                        const riskCfg = RISK_CONFIG[risk] || RISK_CONFIG.green;
                        return (
                            <Link key={p.id} to={`/patient/${p.id}`} className="patient-card">
                                <div className="patient-card-header">
                                    <div className="patient-avatar" style={{ borderColor: riskCfg.color }}>
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
                                        Day {p.pod || 1} post-op
                                    </span>
                                    <span className="patient-risk" style={{ color: riskCfg.color, background: riskCfg.bg }}>
                                        {riskCfg.label}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                <div className="demo-note">
                    <AlertCircle size={14} />
                    Synthetic environment — synthetic patient data for demonstration purposes.
                </div>
            </div>
        );
    }

    if (loading) return <div className="loading-center"><div className="spinner" /></div>;

    const displayAI = checkinResult || patientDetail?.checkins?.[0]?.parsed;

    return (
        <div className="patient-detail-page">
            {/* Breadcrumb */}
            <div className="detail-breadcrumb">
                <Link to="/patient">All Patients</Link>
                <ChevronRight size={16} />
                <span>{pt?.name}</span>
            </div>

            {/* Header */}
            <div className="detail-header">
                <div className="detail-header-left">
                    <div className="detail-avatar" style={{ borderColor: rc.color }}>
                        {pt?.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                        <h1>{pt?.name}</h1>
                        <p>{pt?.age_years}y • {pt?.procedure_name} • Day {pt?.pod || 1}</p>
                    </div>
                </div>
                <div className="status-badge" style={{ background: rc.bg, color: rc.color }}>
                    {rc.label}
                </div>
            </div>

            {/* Tabs */}
            <div className="detail-tabs">
                {PATIENT_TABS.map(tab => (
                    <button
                        key={tab}
                        className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="detail-content">
                {activeTab === 'Recovery Hub' && (
                    <div className="overview-grid">
                        {/* Doctor's Message Card - if available */}
                        {(() => {
                            const savedResult = getPatientResult(id);
                            const patientMsg = savedResult?.patientMessage;
                            if (patientMsg && (patientMsg.summary || patientMsg.self_care?.length > 0)) {
                                return (
                                    <div className="detail-card detail-card--wide patient-message-card">
                                        <div className="card-header">
                                            <MessageSquare size={18} style={{ color: '#059669' }} />
                                            <h3>Message from Your Care Team</h3>
                                            {savedResult?.reviewedAt && (
                                                <span className="card-badge">
                                                    {new Date(savedResult.reviewedAt).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="doctor-message-content">
                                            {patientMsg.summary && (
                                                <div className="message-summary">
                                                    <p>Checkin submitted and will inform regarding follow up and details.</p>
                                                </div>
                                            )}
                                            {patientMsg.self_care?.length > 0 && (
                                                <div className="self-care-section">
                                                    <h4>Self-Care Instructions</h4>
                                                    <ul className="self-care-checklist">
                                                        {patientMsg.self_care.map((item, i) => (
                                                            <li key={i}>
                                                                <CheckCircle size={16} />
                                                                <span>{item}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {patientMsg.next_checkin && (
                                                <div className="next-checkin-notice">
                                                    <Clock size={16} />
                                                    <span>Next check-in: <strong>{patientMsg.next_checkin}</strong></span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* Status card */}
                        <div className="detail-card">
                            <div className="card-header">
                                <Heart size={18} />
                                <h3>Recovery Status</h3>
                            </div>
                            <div className="status-message" style={{ color: rc.color }}>
                                {displayAI?.patient_message?.summary ? 'Checkin submitted and will inform regarding follow up and details' : rc.text}
                            </div>
                            {pt?.name && pt?.procedure_name && (
                                <div className="status-submessage" style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: 4 }}>
                                    {pt.name}, your monitoring for {pt.procedure_name} is active.
                                </div>
                            )}
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', marginTop: 16 }}
                                onClick={() => setActiveTab('Daily Check-in')}
                            >
                                <FileText size={16} />
                                Start Daily Check-in
                            </button>
                        </div>

                        {/* Latest vitals */}
                        <div className="detail-card">
                            <div className="card-header">
                                <Activity size={18} />
                                <h3>Latest Check-in</h3>
                            </div>
                            <div className="vitals-grid">
                                <div className="vital-item">
                                    <TrendingUp size={16} />
                                    <span className="vital-label">Pain</span>
                                    <span className="vital-value">{checkin.pain_score}/10</span>
                                </div>
                                <div className="vital-item">
                                    <Thermometer size={16} />
                                    <span className="vital-label">Temp</span>
                                    <span className="vital-value">{checkin.temperature}°C</span>
                                </div>
                            </div>
                        </div>

                        {/* Patient-friendly status message rendering handled above */}
                        {/* Trend Graph Preview */}
                        {timeline?.length > 0 && (
                            <div className="detail-card detail-card--wide" style={{ marginTop: 24 }}>
                                <div className="card-header">
                                    <TrendingUp size={18} />
                                    <h3>Recovery Trends</h3>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ marginLeft: 'auto' }}
                                        onClick={() => setActiveTab('Trends')}
                                    >
                                        View Full Log
                                    </button>
                                </div>
                                <TimelineChart data={timeline.slice(-7)} metrics={['pain', 'temp']} />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Daily Check-in' && (
                    <div className="checkin-layout">
                        {/* Left: Check-in Form */}
                        <div className="detail-card checkin-form-card">
                            <div className="card-header">
                                <FileText size={18} />
                                <h3>Daily Recovery Check-in</h3>
                                <div className="input-toggle">
                                    <button className={!voiceMode ? 'active' : ''} onClick={() => setVoiceMode(false)}>
                                        <FileText size={14} /> Form
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
                                            <p>Describe how you're feeling today — pain level, temperature, any concerns with your wound or recovery.</p>
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
                                            <div className="transcript-actions">
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => setVoiceTranscript('')}
                                                >
                                                    Clear
                                                </button>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => {
                                                        setVoiceMode(false);
                                                        pushNotice({ type: 'success', title: 'Applied', message: 'Voice input saved. Complete the form.' });
                                                    }}
                                                >
                                                    Continue with Form
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="checkin-form">
                                    <div className="form-group">
                                        <label>Pain Level (0–10)</label>
                                        <PainScale value={checkin.pain_score} onChange={v => setCheckin({ ...checkin, pain_score: v })} />
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label><Thermometer size={14} /> Temperature (°C)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={checkin.temperature}
                                                onChange={e => setCheckin({ ...checkin, temperature: +e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label><Footprints size={14} /> Mobility</label>
                                            <select value={checkin.mobility} onChange={e => setCheckin({ ...checkin, mobility: e.target.value })}>
                                                <option value="normal">Normal — walking freely</option>
                                                <option value="reduced">Reduced — some difficulty</option>
                                                <option value="minimal">Minimal — mostly resting</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Nausea / Vomiting?</label>
                                            <div className="toggle-btns">
                                                <button className={checkin.nausea_vomiting ? 'active' : ''} onClick={() => setCheckin({ ...checkin, nausea_vomiting: true })}>Yes</button>
                                                <button className={!checkin.nausea_vomiting ? 'active' : ''} onClick={() => setCheckin({ ...checkin, nausea_vomiting: false })}>No</button>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label><Utensils size={14} /> Appetite</label>
                                            <select value={checkin.appetite} onChange={e => setCheckin({ ...checkin, appetite: e.target.value })}>
                                                <option value="good">Good</option>
                                                <option value="reduced">Reduced</option>
                                                <option value="poor">Poor</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Wound Concerns</label>
                                        <select value={checkin.wound_concerns} onChange={e => setCheckin({ ...checkin, wound_concerns: e.target.value })}>
                                            <option value="none">None — looks clean</option>
                                            <option value="redness">Mild redness</option>
                                            <option value="swelling">Swelling / warmth</option>
                                            <option value="discharge">Discharge</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>📷 Wound Image (Optional)</label>
                                        <div className="image-upload-box">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                id="wound-image-upload"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => {
                                                            setCheckin({ ...checkin, wound_image: ev.target.result });
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                                style={{ display: 'none' }}
                                            />
                                            {checkin.wound_image ? (
                                                <div className="wound-image-preview">
                                                    <img src={checkin.wound_image} alt="Wound" />
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setCheckin({ ...checkin, wound_image: null })}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ) : (
                                                <label htmlFor="wound-image-upload" className="upload-label">
                                                    <Upload size={24} />
                                                    <span>Upload wound photo</span>
                                                    <span style={{ fontSize: 12, color: '#94A3B8' }}>Helps clinicians assess healing</span>
                                                </label>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        className={`btn btn-primary ${submitting ? 'loading' : ''}`}
                                        onClick={handleSubmitCheckin}
                                        disabled={submitting}
                                        style={{ width: '100%', marginTop: 16 }}
                                    >
                                        {submitting ? 'Analyzing...' : 'Submit Check-in'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Right: Preview & AI Analysis */}
                        <div className="detail-card checkin-preview-card">
                            {!checkinResult ? (
                                <>
                                    <div className="card-header">
                                        <CheckCircle size={18} />
                                        <h3>Check-in Preview</h3>
                                        <span style={{ fontSize: 12, color: '#6B7280' }}>What will be sent to your care team</span>
                                    </div>

                                    <div className="checkin-preview">
                                        <div className="preview-section">
                                            <h4>📋 Your Symptoms</h4>
                                            <div className="preview-items">
                                                <div className="preview-item">
                                                    <span className="preview-label">Pain Level:</span>
                                                    <span className="preview-value">{checkin.pain_score}/10</span>
                                                </div>
                                                <div className="preview-item">
                                                    <span className="preview-label">Temperature:</span>
                                                    <span className="preview-value">{checkin.temperature}°C</span>
                                                </div>
                                                <div className="preview-item">
                                                    <span className="preview-label">Mobility:</span>
                                                    <span className="preview-value">{checkin.mobility}</span>
                                                </div>
                                                <div className="preview-item">
                                                    <span className="preview-label">Nausea/Vomiting:</span>
                                                    <span className="preview-value">{checkin.nausea_vomiting ? 'Yes' : 'No'}</span>
                                                </div>
                                                <div className="preview-item">
                                                    <span className="preview-label">Appetite:</span>
                                                    <span className="preview-value">{checkin.appetite}</span>
                                                </div>
                                                <div className="preview-item">
                                                    <span className="preview-label">Wound:</span>
                                                    <span className="preview-value">{checkin.wound_concerns}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {checkin.wound_image && (
                                            <div className="preview-section">
                                                <h4>📷 Wound Photo</h4>
                                                <div className="preview-image">
                                                    <img src={checkin.wound_image} alt="Wound preview" />
                                                    <div className="preview-image-note">
                                                        ✓ Image will be analyzed by AI for signs of infection, healing progress, and complications
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {voiceTranscript && (
                                            <div className="preview-section">
                                                <h4>🎤 Voice Notes</h4>
                                                <div className="preview-transcript">
                                                    {voiceTranscript}
                                                </div>
                                            </div>
                                        )}

                                        <div className="preview-footer">
                                            <AlertCircle size={14} />
                                            <span>Your doctor will receive this information and AI analysis within seconds of submission</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* AI Analysis Results - Patient-Friendly */}
                                    <div className="card-header">
                                        <Zap size={18} style={{ color: '#8B5CF6' }} />
                                        <h3>Your Recovery Analysis</h3>
                                        <span style={{ fontSize: 12, color: '#6B7280' }}>AI-powered assessment</span>
                                    </div>

                                    <div className="ai-analysis-patient">
                                        {/* Overall Status */}
                                        <div className="patient-status-card" style={{
                                            background: checkinResult.risk_level === 'red' ? '#FEE2E2' :
                                                checkinResult.risk_level === 'amber' ? '#FEF3C7' : '#D1FAE5',
                                            borderColor: checkinResult.risk_level === 'red' ? '#DC2626' :
                                                checkinResult.risk_level === 'amber' ? '#D97706' : '#059669',
                                        }}>
                                            <div className="patient-status-header">
                                                <div className="patient-status-icon">
                                                    {checkinResult.risk_level === 'red' ? '🔴' :
                                                        checkinResult.risk_level === 'amber' ? '🟡' : '🟢'}
                                                </div>
                                                <div>
                                                    <h4 style={{
                                                        color: checkinResult.risk_level === 'red' ? '#991B1B' :
                                                            checkinResult.risk_level === 'amber' ? '#92400E' : '#065F46'
                                                    }}>
                                                        {checkinResult.risk_level === 'red' ? 'Needs Attention' :
                                                            checkinResult.risk_level === 'amber' ? 'Monitor Closely' : 'On Track'}
                                                    </h4>
                                                    <p>
                                                        {checkinResult.risk_level === 'red' ? 'Your recovery may need medical attention' :
                                                            checkinResult.risk_level === 'amber' ? 'Your recovery needs closer monitoring' :
                                                                'Your recovery is progressing well'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* MedGemma 27B Analysis - Patient Friendly */}
                                        <div className="analysis-section">
                                            <h4>🏥 Clinical Assessment (AI)</h4>
                                            <div className="analysis-content">
                                                {checkinResult.clinical_explanation ? (
                                                    <p>{checkinResult.clinical_explanation}</p>
                                                ) : checkinResult.clinical_rationale ? (
                                                    <p>{checkinResult.clinical_rationale}</p>
                                                ) : (
                                                    <p>Based on your symptoms and vitals, the AI has assessed your recovery status.</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* MedGemma 4B Image Analysis */}
                                        {checkinResult.image_analysis && (
                                            <div className="analysis-section image-analysis-section">
                                                <h4>📷 Wound Image Analysis (AI Vision)</h4>
                                                <div className="image-analysis-grid">
                                                    {checkin.wound_image && (
                                                        <div className="analysis-image-preview">
                                                            <img src={checkin.wound_image} alt="Analyzed wound" />
                                                        </div>
                                                    )}
                                                    <div className="image-analysis-results">
                                                        <div className="ia-status">
                                                            <span className="ia-label">Wound Status:</span>
                                                            <span className={`ia-value ia-${checkinResult.image_analysis.wound_status?.toLowerCase()}`}>
                                                                {checkinResult.image_analysis.wound_status || 'Analyzed'}
                                                            </span>
                                                        </div>
                                                        {(checkinResult.image_analysis.wound_description || checkinResult.image_analysis.description) && (
                                                            <div className="ia-description">
                                                                <p>{checkinResult.image_analysis.wound_description || checkinResult.image_analysis.description}</p>
                                                            </div>
                                                        )}
                                                        {checkinResult.image_analysis.healing_stage && (
                                                            <div className="ia-healing">
                                                                <span className="ia-label">Healing Stage:</span>
                                                                <span className="ia-value">{checkinResult.image_analysis.healing_stage}</span>
                                                            </div>
                                                        )}
                                                        {checkinResult.image_analysis.concerns?.length > 0 && (
                                                            <div className="ia-concerns">
                                                                <strong>Observations:</strong>
                                                                <ul>
                                                                    {checkinResult.image_analysis.concerns.map((c, i) => (
                                                                        <li key={i}>{c}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {checkinResult.image_analysis.recommendations?.length > 0 && (
                                                            <div className="ia-recommendations">
                                                                <strong>AI Recommendations:</strong>
                                                                <ul>
                                                                    {checkinResult.image_analysis.recommendations.map((r, i) => (
                                                                        <li key={i}>{r}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Patient Message from 4B */}
                                        {checkinResult.patient_message && (
                                            <div className="analysis-section patient-instructions">
                                                <h4>📝 Your Care Instructions</h4>
                                                {checkinResult.patient_message.summary && (
                                                    <p className="patient-msg-summary">{checkinResult.patient_message.summary}</p>
                                                )}
                                                {checkinResult.patient_message.self_care?.length > 0 && (
                                                    <div className="self-care-list">
                                                        <strong>What to do:</strong>
                                                        <ul>
                                                            {checkinResult.patient_message.self_care.map((item, i) => (
                                                                <li key={i}>
                                                                    <CheckCircle size={14} style={{ color: '#059669', marginRight: 6 }} />
                                                                    {item}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {checkinResult.patient_message.next_checkin && (
                                                    <div className="next-checkin-reminder">
                                                        <Clock size={14} />
                                                        <span>Next check-in: <strong>{checkinResult.patient_message.next_checkin}</strong></span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* What Doctor Sees */}
                                        <div className="analysis-section doctor-handoff-preview">
                                            <h4>👨‍⚕️ Sent to Your Doctor</h4>
                                            <div className="doctor-handoff-items">
                                                <div className="handoff-item">
                                                    <CheckCircle size={14} style={{ color: '#059669' }} />
                                                    <span>Your symptoms and vitals</span>
                                                </div>
                                                <div className="handoff-item">
                                                    <CheckCircle size={14} style={{ color: '#059669' }} />
                                                    <span>AI clinical assessment</span>
                                                </div>
                                                {checkinResult.image_analysis && (
                                                    <div className="handoff-item">
                                                        <CheckCircle size={14} style={{ color: '#059669' }} />
                                                        <span>Wound image analysis</span>
                                                    </div>
                                                )}
                                                {checkinResult.sbar && (
                                                    <div className="handoff-item">
                                                        <CheckCircle size={14} style={{ color: '#059669' }} />
                                                        <span>Clinical handoff (SBAR)</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="handoff-footer">
                                                <AlertCircle size={14} />
                                                <span>Your doctor has been notified and will review this within 24 hours</span>
                                            </div>
                                        </div>

                                        <button
                                            className="btn btn-primary"
                                            onClick={() => { setCheckinResult(null); setActiveTab('Recovery Hub'); }}
                                            style={{ width: '100%' }}
                                        >
                                            Done
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'Wearable' && (
                    <div className="overview-grid">
                        <div className="detail-card detail-card--wide">
                            <div className="card-header">
                                <Watch size={18} />
                                <h3>Wearable Device Monitor</h3>
                                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                                    {wearableSummary?.device_connected ? (
                                        <span className="wearable-status wearable-connected"><Wifi size={14} /> Connected</span>
                                    ) : (
                                        <span className="wearable-status wearable-disconnected"><WifiOff size={14} /> No Device</span>
                                    )}
                                </div>
                            </div>

                            {/* Simulate panel for demo */}
                            <div className="wearable-simulate-bar">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Simulate Stream:</span>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {['normal', 'recovering', 'deteriorating'].map(sc => (
                                            <button key={sc} onClick={() => setWearableScenario(sc)}
                                                className={`wearable-scenario-btn ${wearableScenario === sc ? 'active' : ''}`}
                                                style={sc === 'deteriorating' ? { borderColor: '#DC262660', color: wearableScenario === sc ? '#fff' : '#DC2626', background: wearableScenario === sc ? '#DC2626' : 'transparent' } : {}}>
                                                {sc === 'normal' ? '⚡ Normal' : sc === 'recovering' ? '💚 Recovering' : '🔴 Deteriorating'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <label className="wearable-auto-sync-toggle">
                                        <input
                                            type="checkbox"
                                            checked={wearableAutoSync}
                                            onChange={(e) => setWearableAutoSync(e.target.checked)}
                                        />
                                        <div className="toggle-slider"></div>
                                        <span className="toggle-label">Live Stream</span>
                                        {wearableAutoSync && <span className="live-indicator">LIVE</span>}
                                    </label>

                                    <button className="btn btn-primary btn-sm" disabled={wearableSimulating || wearableAutoSync}
                                        onClick={async () => {
                                            setWearableSimulating(true);
                                            const result = await v1Api.simulateWearable(id, wearableScenario, 'apple_watch');
                                            if (result.readings) {
                                                setWearableHistory(prev => [...prev, { ...result, time: new Date().toLocaleTimeString() }].slice(-20));
                                            }
                                            const summary = await v1Api.getWearableSummary(id);
                                            setWearableSummary(summary);
                                            setWearableSimulating(false);
                                            if (result.anomalies?.length > 0) {
                                                pushNotice({ type: 'warning', message: `Wearable alert: ${result.anomalies.length} anomaly detected` });
                                            }
                                        }}>
                                        <Zap size={14} /> {wearableSimulating ? 'Syncing…' : 'Manual Sync'}
                                    </button>
                                </div>
                            </div>

                            {/* Real-time vitals grid */}
                            {wearableSummary?.latest_vitals && Object.keys(wearableSummary.latest_vitals).length > 0 ? (
                                <div className="wearable-vitals-grid">
                                    {(() => {
                                        const METRIC_ICONS = {
                                            heart_rate: Heart, spo2: Activity, hrv: TrendingUp,
                                            temperature: Thermometer, steps: Footprints,
                                            resp_rate: Activity, sleep_hours: Clock
                                        };

                                        return Object.entries(wearableSummary.latest_vitals).map(([metric, data]) => {
                                            const thresholds = wearableSummary.thresholds?.[metric] || {};
                                            const val = data?.value ?? data;
                                            const isHigh = (thresholds.high && val >= thresholds.high) || (thresholds.critical_high && val >= thresholds.critical_high);
                                            const isLow = (thresholds.low && val <= thresholds.low) || (thresholds.critical_low && val <= thresholds.critical_low) || (thresholds.low_daily && val <= thresholds.low_daily);
                                            const isCritical = (thresholds.critical_high && val >= thresholds.critical_high) || (thresholds.critical_low && val <= thresholds.critical_low);
                                            const statusColor = isCritical ? '#DC2626' : (isHigh || isLow) ? '#D97706' : '#059669';
                                            const IconComponent = METRIC_ICONS[metric] || Activity;

                                            return (
                                                <div key={metric} className="wearable-vital-card" style={{ borderLeftColor: statusColor }}>
                                                    <div className="wv-header">
                                                        <IconComponent size={16} style={{ color: statusColor }} />
                                                        <span className="wv-label">{metric.replace(/_/g, ' ')}</span>
                                                    </div>
                                                    <div className="wv-value" style={{ color: statusColor }}>
                                                        {typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : String(val)}
                                                        <span className="wv-unit">{thresholds.unit || ''}</span>
                                                    </div>
                                                    <div className="wv-status">
                                                        {isCritical ? <><AlertTriangle size={10} /> Critical</> : (isHigh || isLow) ? <><AlertCircle size={10} /> Warning</> : <><CheckCircle size={10} /> Normal</>}
                                                    </div>
                                                    <div className="wv-source">via {data?.device_type || 'wearable'}</div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            ) : (
                                <div className="wearable-empty">
                                    <Watch size={48} style={{ color: '#CBD5E1' }} />
                                    <div style={{ color: '#94A3B8', marginTop: 8 }}>No wearable data yet</div>
                                    <div style={{ color: '#CBD5E1', fontSize: 12 }}>Use the simulator above or connect a real device via HealthKit / Health Connect</div>
                                </div>
                            )}

                            {/* Risk assessment from wearable */}
                            {wearableSummary?.risk_delta?.risk_delta > 0 && (
                                <div className="wearable-risk-panel" style={{
                                    borderColor: wearableSummary.risk_delta.suggested_escalation === 'red' ? '#DC2626' : '#D97706',
                                    background: wearableSummary.risk_delta.suggested_escalation === 'red' ? '#FEE2E2' : '#FEF3C7',
                                }}>
                                    <AlertTriangle size={16} style={{ color: wearableSummary.risk_delta.suggested_escalation === 'red' ? '#DC2626' : '#D97706' }} />
                                    <div>
                                        <strong>Wearable Risk Assessment</strong>
                                        <div style={{ fontSize: 13 }}>
                                            Risk score delta: +{wearableSummary.risk_delta.risk_delta} ·
                                            {wearableSummary.risk_delta.critical_count} critical, {wearableSummary.risk_delta.warning_count} warnings ·
                                            {wearableSummary.risk_delta.suggested_escalation && <strong> Suggested: escalate to {wearableSummary.risk_delta.suggested_escalation.toUpperCase()}</strong>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Anomaly history */}
                            {wearableHistory.length > 0 && (
                                <div className="wearable-history">
                                    <h4 style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>Sync History</h4>
                                    <div className="wearable-history-list">
                                        {wearableHistory.slice().reverse().map((entry, i) => (
                                            <div key={i} className="wearable-history-item">
                                                <span className="wh-time">{entry.time}</span>
                                                <span className="wh-scenario" style={{
                                                    color: entry.scenario === 'deteriorating' ? '#DC2626' : entry.scenario === 'recovering' ? '#059669' : '#64748B',
                                                }}>{entry.scenario}</span>
                                                <span className="wh-anomalies">
                                                    {entry.anomalies?.length > 0
                                                        ? <span style={{ color: '#DC2626' }}>{entry.anomalies.length} anomaly(s)</span>
                                                        : <span style={{ color: '#059669' }}>All normal</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'Trends' && (
                    <div className="detail-card detail-card--full">
                        {timeline.length > 0 ? (
                            <TimelineChart data={timeline} metrics={['pain', 'temp']} title="Recovery Trends" />
                        ) : (
                            <div className="empty-state-sm">
                                <TrendingUp size={32} />
                                <p>Complete check-ins to see your trends</p>
                            </div>
                        )}

                        {checkinHistory.length > 0 && (
                            <div style={{ marginTop: 24 }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Check-in Log</h3>
                                <div className="checkin-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Pain</th>
                                                <th>Temp</th>
                                                <th>BP</th>
                                                <th>HR</th>
                                                <th>Flags</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {checkinHistory.slice(0, 10).map((c, i) => (
                                                <tr key={i}>
                                                    <td>{c.date}</td>
                                                    <td>{c.pain}</td>
                                                    <td>{c.temp}°C</td>
                                                    <td>{c.bp}</td>
                                                    <td>{c.hr}</td>
                                                    <td>
                                                        {c.flags?.map((f, j) => (
                                                            <span key={j} className={`flag-badge flag-${f.toLowerCase()}`}>{f}</span>
                                                        ))}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Care Plan' && (
                    <div className="detail-card detail-card--full">
                        <div className="card-header">
                            <CheckCircle size={18} />
                            <h3>Your Care Plan</h3>
                        </div>
                        <div className="care-plan-list">
                            {(patientDetail?.planChecklist || [
                                'Take prescribed medications as directed',
                                'Monitor wound site daily for changes',
                                'Walk for 10-15 minutes twice daily',
                                'Stay hydrated — aim for 8 glasses of water',
                                'Complete daily check-in by 6 PM',
                            ]).map((item, i) => (
                                <div key={i} className="care-item">
                                    <CheckCircle size={18} />
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
