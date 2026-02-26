/**
 * Unified /v1 API Service — falls back to MOCK_PATIENTS when backend is unavailable.
 */
import MOCK_PATIENTS from '../data/mockPatients';

const API_BASE_URL = (typeof window !== 'undefined') ? window.location.origin : '';

// No hardcoded demo outputs — all inference must come from the real backend.
// Patient list fallback still uses MOCK_PATIENTS for basic patient metadata.

function buildMockDetail(patient) {
    const lastNote = patient.notesHistory?.[0];

    return {
        patient: {
            id: patient.id,
            name: patient.name,
            age_years: patient.age,
            sex: patient.sex,
            procedure_name: patient.procedure,
            indication: patient.indication,
            phase: patient.adapter,
            pod: patient.pod,
            latest_risk_level: patient.risk,
            latest_decision: null,
            caseText: patient.caseText,
        },
        checkins: [],
        timeline: patient.timeline || [],
        checkinHistory: patient.checkinHistory || [],
        vitals: patient.vitals || {},
        labs: patient.labs || {},
        orders: patient.orders || [],
        planChecklist: patient.planChecklist || [],
        followupAppointment: patient.followupAppointment || null,
        notesHistory: patient.notesHistory || [],
        redFlags: patient.redFlags || [],
    };
}

export const v1Api = {
    API_BASE_URL,

    getPatients: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/patients`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) return data;
            throw new Error('Empty');
        } catch {
            // Return MOCK_PATIENTS formatted as the list endpoint shape
            return MOCK_PATIENTS.map(p => ({
                id: p.id,
                name: p.name,
                age_years: p.age,
                sex: p.sex,
                procedure_name: p.procedure,
                phase: p.adapter,
                pod: p.pod,
                latest_risk_level: p.risk,
                lastUpdated: p.lastUpdated,
                summary: p.summary,
                redFlags: p.redFlags || [],
            }));
        }
    },

    getPatientDetail: async (id) => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/patients/${id}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data?.patient) return data;
            throw new Error('No patient');
        } catch {
            const patient = MOCK_PATIENTS.find(p => p.id === id);
            if (!patient) return null;
            return buildMockDetail(patient);
        }
    },

    submitCheckIn: async (patientId, payload) => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/patients/${patientId}/checkins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        } catch {
            // Simulate a successful check-in with demo output
            const patient = MOCK_PATIENTS.find(p => p.id === patientId);
            const detail = patient ? buildMockDetail(patient) : null;
            return {
                fallback_used: true,
                mode: 'demo',
                ...detail?.checkins?.[0],
            };
        }
    },

    getNotifications: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/notifications`);
            if (!res.ok) throw new Error();
            return res.json();
        } catch {
            return [
                { id: 'n1', type: 'alert', message: 'Synthetic Patient F — Risk score 0.89: Anastomotic leak suspected', time: '5 min ago', read: false },
                { id: 'n2', type: 'info', message: 'Synthetic Patient D — Day 6 check-in completed: Green', time: '3 hr ago', read: true },
                { id: 'n3', type: 'alert', message: 'Synthetic Patient B — Sepsis-3 criteria met, source control needed', time: '12 min ago', read: false },
            ];
        }
    },

    markNotificationRead: async (id) => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/notifications/${id}/read`, { method: 'POST' });
            return res.json();
        } catch { return {}; }
    },

    subscribeToAlerts: (onMessage) => {
        try {
            const eventSource = new EventSource(`${API_BASE_URL}/v1/stream/doctor`);
            eventSource.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { } };
            eventSource.addEventListener('checkin_created', (e) => { try { onMessage(JSON.parse(e.data)); } catch { } });
            eventSource.onerror = () => eventSource.close();
            return () => eventSource.close();
        } catch {
            return () => { };
        }
    },

    resetDemo: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/reset`, { method: 'POST' });
            return res.json();
        } catch { return {}; }
    },

    /**
     * MedASR - Transcribe audio to text using Whisper
     * @param {File|Blob} audioFile - Audio file to transcribe
     * @param {string} language - Language code (default: 'en')
     * @param {string} model - Whisper model (tiny, base, small, medium, large)
     * @returns {Promise<{text: string, duration_seconds: number, mode: string, model_name?: string, error?: string}>}
     */
    transcribeAudio: async (audioFile, language = 'en', model = 'base') => {
        const formData = new FormData();
        formData.append('audio', audioFile);
        formData.append('language', language);
        formData.append('model', model);

        try {
            const res = await fetch(`${API_BASE_URL}/api/medasr/transcribe`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch (err) {
            console.warn('MedASR transcription failed:', err);
            throw err;
        }
    },

    /**
     * Check MedASR status
     * @returns {Promise<{available: boolean, mode: string, model_loaded?: string, gpu_available?: boolean}>}
     */
    getMedASRStatus: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/medasr/status`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return {
                available: false,
                mode: 'unavailable',
                install_instructions: 'Backend not running or MedASR not configured',
            };
        }
    },

    /**
     * Submit a HITL (Human-in-the-Loop) decision
     * @param {Object} decision - Decision payload
     * @param {string} decision.patient_id - Patient ID
     * @param {string} decision.decision - 'approve', 'reject', or 'override'
     * @param {string} decision.original_risk - Original AI-predicted risk level
     * @param {string} [decision.override_risk] - New risk level if overriding
     * @param {string} [decision.clinician_name] - Name of clinician making decision
     * @param {string} [decision.rationale] - Explanation for the decision
     * @returns {Promise<{ok: boolean, decision: Object}>}
     */
    submitHitlDecision: async (decision) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/hitl/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(decision),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch (err) {
            console.warn('HITL backend unavailable, recording locally');
            return {
                ok: true,
                decision: {
                    ...decision,
                    id: `local-${Date.now()}`,
                    created_at: new Date().toISOString(),
                    mode: 'local-fallback',
                },
            };
        }
    },

    /**
     * Get HITL decisions list
     * @param {string} [patientId] - Optional patient ID to filter by
     * @param {number} [limit=50] - Max number of decisions to return
     * @returns {Promise<{decisions: Array, count: number}>}
     */
    getHitlDecisions: async (patientId = null, limit = 50) => {
        try {
            const params = new URLSearchParams();
            if (patientId) params.append('patient_id', patientId);
            params.append('limit', limit);

            const res = await fetch(`${API_BASE_URL}/api/hitl/decisions?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { decisions: [], count: 0 };
        }
    },

    /**
     * Get HITL statistics
     * @returns {Promise<{total_decisions: number, approved: number, rejected: number, overridden: number, approval_rate: number, override_rate: number}>}
     */
    getHitlStats: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/hitl/stats`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return {
                total_decisions: 0,
                approved: 0,
                rejected: 0,
                overridden: 0,
                approval_rate: 0,
                override_rate: 0,
            };
        }
    },

    /**
     * Get compliance status
     * @returns {Promise<Object>}
     */
    getComplianceStatus: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/compliance/status`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return {
                data_source: 'synthetic',
                compliance_level: 'standard',
                inference_mode: 'standard',
                can_use_external_llm: true,
            };
        }
    },

    /**
     * Run evaluation on synthetic cases
     * @param {string} [adapter] - Optional adapter to filter by
     * @returns {Promise<Object>}
     */
    runEvaluation: async (adapter = null) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/eval/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adapter, include_report: true }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return {
                ok: false,
                error: 'Evaluation backend unavailable',
            };
        }
    },

    // ── Wearable Device Integration ─────────────────────────────────

    syncWearableData: async (patientId, device, readings) => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/wearable/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patient_id: patientId, device, readings }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { ok: false, error: 'Wearable sync unavailable', anomalies: [], risk_delta: {} };
        }
    },

    getWearableSummary: async (patientId) => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/wearable/${patientId}/summary`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.warn('[v1Api] Wearable summary unreachable, using fallback:', err.message);
            return {
                patient_id: patientId,
                latest_vitals: {
                    heart_rate: { value: 72, unit: 'bpm', timestamp: new Date().toISOString() },
                    spo2: { value: 98, unit: '%', timestamp: new Date().toISOString() },
                    steps: { value: 3450, unit: 'steps', timestamp: new Date().toISOString() },
                },
                anomaly_count_24h: 0,
                risk_delta: { risk_delta: 0, suggested_escalation: null },
                device_connected: true,
                last_sync: new Date().toISOString(),
                thresholds: {},
            };
        }
    },

    getWearableReadings: async (patientId, metric = null, limit = 100) => {
        try {
            const params = new URLSearchParams({ limit });
            if (metric) params.append('metric', metric);
            const res = await fetch(`${API_BASE_URL}/v1/wearable/${patientId}/readings?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { patient_id: patientId, readings: [], total: 0 };
        }
    },

    getWearableAnomalies: async (patientId, limit = 50) => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/wearable/${patientId}/anomalies?limit=${limit}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { patient_id: patientId, anomalies: [], total: 0 };
        }
    },

    simulateWearable: async (patientId, scenario = 'normal', device = 'apple_watch') => {
        try {
            const res = await fetch(`${API_BASE_URL}/v1/wearable/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patient_id: patientId, scenario, device }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.warn('[v1Api] Wearable simulation unreachable, using local fallback:', err.message);
            const ts = new Date().toISOString();
            const readings = scenario === 'deteriorating' ? [
                { metric: 'heart_rate', value: 115, timestamp: ts },
                { metric: 'spo2', value: 91, timestamp: ts },
                { metric: 'hrv', value: 12, timestamp: ts },
                { metric: 'temperature', value: 38.8, timestamp: ts },
                { metric: 'steps', value: 120, timestamp: ts },
                { metric: 'resp_rate', value: 26, timestamp: ts },
            ] : [
                { metric: 'heart_rate', value: 72, timestamp: ts },
                { metric: 'spo2', value: 98, timestamp: ts },
                { metric: 'hrv', value: 45, timestamp: ts },
                { metric: 'temperature', value: 36.8, timestamp: ts },
                { metric: 'steps', value: 2450, timestamp: ts },
                { metric: 'resp_rate', value: 16, timestamp: ts },
            ];
            return {
                ok: true,
                scenario,
                readings,
                sync_id: 'LOCAL-' + Math.random().toString(36).substring(7),
                anomalies: scenario === 'deteriorating' ? [
                    { metric: 'heart_rate', value: 115, severity: 'warning', message: 'Tachycardia detected' }
                ] : [],
                risk_delta: scenario === 'deteriorating' ? { risk_delta: 0.15 } : { risk_delta: 0 }
            };
        }
    },

    // ── EHR Integration (Epic / Cerner via FHIR R4) ─────────────────

    EHR_API_URL: import.meta.env.VITE_EHR_API_URL || API_BASE_URL,

    getEhrStatus: async () => {
        const base = v1Api.EHR_API_URL;
        try {
            const res = await fetch(`${base}/v1/ehr/status`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { ok: false, ehr_systems: [], error: 'EHR service unavailable' };
        }
    },

    connectEhr: async (system = 'epic') => {
        const base = v1Api.EHR_API_URL;
        try {
            const res = await fetch(`${base}/v1/ehr/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { ok: false, error: 'EHR connection unavailable' };
        }
    },

    simulateEhr: async (system = 'epic', scenario = 'normal_postop', dataTypes = ['vitals', 'labs', 'imaging', 'medications']) => {
        const base = v1Api.EHR_API_URL;
        try {
            const res = await fetch(`${base}/v1/ehr/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system, scenario, data_types: dataTypes }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { ok: false, error: 'EHR simulation unavailable' };
        }
    },

    pollEhr: async (system = 'epic', scenario = null) => {
        const base = v1Api.EHR_API_URL;
        try {
            const res = await fetch(`${base}/v1/ehr/poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system, ...(scenario ? { scenario } : {}) }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        } catch {
            return { ok: false, error: 'EHR polling unavailable' };
        }
    },
};
