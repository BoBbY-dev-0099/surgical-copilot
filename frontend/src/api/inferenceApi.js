/**
 * Inference API client — talks to /api/* backend routes.
 *
 * Each call returns { data, rawText, error }.
 * Falls back to MOCK_CASES (SAMPLE_MAP) when backend is unreachable or returns null.
 */
import { SAMPLE_MAP } from '../data/mockCases';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const TIMEOUT_MS = 90_000;

// ── Internal fetch helper ────────────────────────────────────────

async function _post(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok || res.status >= 500) {
            throw new Error(`HTTP ${res.status}`);
        }

        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
            throw new Error('Non-JSON response');
        }

        return await res.json();
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

async function _get(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

// ── Public API calls ─────────────────────────────────────────────

export async function callPhase1b(payload) {
    try {
        const res = await _post('/api/phase1b', payload);
        const data = res.parsed || res.data;

        // Frontend Fallback if data is null but res is ok (backend fallback failed)
        if (!data && !res.error) {
            console.warn('[inferenceApi] phase1b result null, falling back to local mock');
            const mock = SAMPLE_MAP.phase1b.find(s => s.data?.case_text === payload.case_text) || SAMPLE_MAP.phase1b[0];
            return {
                data: mock.expectedOutput,
                rawText: 'LOCAL_FRONTEND_FALLBACK',
                error: null,
                fallbackReason: 'Backend returned null data',
                mode: 'demo',
                wrapper: res,
            };
        }

        return {
            data,
            rawText: res.raw_text || null,
            error: res.error || null,
            fallbackReason: res.fallback_reason || null,
            wrapper: res,
        };
    } catch (err) {
        console.warn('[inferenceApi] phase1b unreachable, falling back to local mock:', err.message);
        const mock = SAMPLE_MAP.phase1b.find(s => s.data?.case_text === payload.case_text) || SAMPLE_MAP.phase1b[0];
        return {
            data: mock.expectedOutput,
            rawText: 'LOCAL_FRONTEND_FALLBACK',
            error: null,
            fallbackReason: `Backend unreachable: ${err.message}`,
            mode: 'demo'
        };
    }
}

export async function callPhase2(payload) {
    try {
        const res = await _post('/api/phase2', payload);
        const data = res.parsed || res.data;

        if (!data && !res.error) {
            console.warn('[inferenceApi] phase2 result null, falling back to local mock');
            const mock = SAMPLE_MAP.phase2.find(s => s.data?.case_text === payload.case_text) || SAMPLE_MAP.phase2[0];
            return {
                data: mock.expectedOutput,
                rawText: 'LOCAL_FRONTEND_FALLBACK',
                error: null,
                fallbackReason: 'Backend returned null data',
                mode: 'demo',
                wrapper: res,
            };
        }

        return {
            data,
            rawText: res.raw_text || null,
            error: res.error || null,
            fallbackReason: res.fallback_reason || null,
            wrapper: res,
        };
    } catch (err) {
        console.warn('[inferenceApi] phase2 unreachable, falling back to local mock:', err.message);
        const mock = SAMPLE_MAP.phase2.find(s => s.data?.case_text === payload.case_text) || SAMPLE_MAP.phase2[0];
        return {
            data: mock.expectedOutput,
            rawText: 'LOCAL_FRONTEND_FALLBACK',
            error: null,
            fallbackReason: `Backend unreachable: ${err.message}`,
            mode: 'demo'
        };
    }
}

export async function callOnc(payload) {
    try {
        const res = await _post('/api/onc', payload);
        const data = res.parsed || res.data;

        if (!data && !res.error) {
            console.warn('[inferenceApi] onc result null, falling back to local mock');
            const mock = SAMPLE_MAP.onc.find(s => s.data?.case_text === payload.case_text) || SAMPLE_MAP.onc[0];
            return {
                data: mock.expectedOutput,
                rawText: 'LOCAL_FRONTEND_FALLBACK',
                error: null,
                fallbackReason: 'Backend returned null data',
                mode: 'demo',
                wrapper: res,
            };
        }

        return {
            data,
            rawText: res.raw_text || null,
            error: res.error || null,
            fallbackReason: res.fallback_reason || null,
            wrapper: res,
        };
    } catch (err) {
        console.warn('[inferenceApi] onc unreachable, falling back to local mock:', err.message);
        const mock = SAMPLE_MAP.onc.find(s => s.data?.case_text === payload.case_text) || SAMPLE_MAP.onc[0];
        return {
            data: mock.expectedOutput,
            rawText: 'LOCAL_FRONTEND_FALLBACK',
            error: null,
            fallbackReason: `Backend unreachable: ${err.message}`,
            mode: 'demo'
        };
    }
}

/**
 * Dispatch to the correct adapter call.
 * @param {'phase1b'|'phase2'|'onc'} adapter
 * @param {object} payload
 */
export async function runInference(adapter, payload) {
    switch (adapter) {
        case 'phase1b': return callPhase1b(payload);
        case 'phase2': return callPhase2(payload);
        case 'onc': return callOnc(payload);
        default: return { data: null, error: `Unknown adapter: ${adapter}` };
    }
}

// ── Stage 2: MedGemma 4B Enrichment ──────────────────────────────

const ENRICH_TIMEOUT_MS = 120_000;

/**
 * Call MedGemma-4B to generate enrichment fields (SBAR, follow-up questions,
 * evidence, patient message, clinical explanation, image analysis).
 *
 * @param {'phase1b'|'phase2'|'onc'} adapter
 * @param {object} coreOutput - The parsed output from the 27B adapter
 * @param {string} caseText - Original case text
 * @param {string[]} [images] - Optional base64-encoded images (wound photos)
 */
export async function callEnrich(adapter, coreOutput, caseText, images = []) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);

    try {
        const res = await fetch(`${API_BASE}/api/enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adapter,
                core_output: coreOutput,
                case_text: caseText,
                images: images || [],
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        return {
            data,
            error: data.error || null,
            mode: data.mode || 'unknown',
        };
    } catch (err) {
        clearTimeout(timer);
        return {
            data: null,
            error: err.message,
            mode: 'error',
        };
    }
}

// ── Locked prompts / schemas ─────────────────────────────────────

let _lockedCache = null;

export async function fetchLocked() {
    if (_lockedCache) return _lockedCache;
    try {
        _lockedCache = await _get('/api/locked');
        return _lockedCache;
    } catch {
        return null;
    }
}

// ── Reset ────────────────────────────────────────────────────────

export async function postReset() {
    try {
        await _post('/api/reset', {});
    } catch {
        // best-effort
    }
}

// ═══════════════════════════════════════════════════════════════════
// Patient / Notes / Alerts — Longitudinal Copilot API
// ═══════════════════════════════════════════════════════════════════

export async function fetchBackendPatients() {
    try {
        return await _get('/api/patients');
    } catch {
        return null;
    }
}

export async function createBackendPatient(data) {
    return _post('/api/patients', data);
}

export async function fetchBackendPatient(patientId) {
    try {
        return await _get(`/api/patients/${patientId}`);
    } catch {
        return null;
    }
}

export async function submitNote(patientId, { note_text, note_type, author_role, auto_infer }) {
    return _post(`/api/patients/${patientId}/notes`, {
        note_text,
        note_type: note_type || 'DAILY_UPDATE',
        author_role: author_role || 'doctor',
        auto_infer: auto_infer !== false,
    });
}

export async function fetchPatientAlerts(patientId) {
    try {
        return await _get(`/api/patients/${patientId}/alerts`);
    } catch {
        return null;
    }
}

export async function fetchPatientSeries(patientId) {
    try {
        return await _get(`/api/patients/${patientId}/series`);
    } catch {
        return null;
    }
}

export async function fetchNoteTemplate(noteType) {
    try {
        const res = await _get(`/api/note-template/${noteType}`);
        return res?.template || '';
    } catch {
        return '';
    }
}
