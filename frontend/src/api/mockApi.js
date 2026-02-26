/**
 * Mock API Module for Surgical Copilot
 *
 * ARCHITECTURE:
 * This module provides a single `runInference()` function that mirrors
 * the real backend contract. To switch to a real backend:
 *
 *   1. Set VITE_BACKEND_URL in your .env file
 *   2. The code will automatically use the real endpoint
 *
 * Fallback behaviour:
 *   - If the backend returns { fallback_used: true }, the result is used
 *     but `_fallbackListeners` are notified so the UI can show a banner.
 *   - If a fetch fails entirely (network error / timeout / 500 with no JSON),
 *     the module falls back to local mock data and notifies listeners.
 *
 * @module mockApi
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || null;

// ─── Fallback Listener System ────────────────────────────────────────
// Pages register a callback via `onFallback(fn)` to be notified when
// demo/fallback output is being shown.

/** @type {Array<(notice: object) => void>} */
const _fallbackListeners = [];

/**
 * Register a callback that fires whenever a fallback/demo result is returned.
 * Returns an unsubscribe function.
 *
 * @param {(notice: {type: string, title: string, message: string, requestId?: string}) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onFallback(fn) {
    _fallbackListeners.push(fn);
    return () => {
        const idx = _fallbackListeners.indexOf(fn);
        if (idx >= 0) _fallbackListeners.splice(idx, 1);
    };
}

function _notifyFallback(notice) {
    _fallbackListeners.forEach((fn) => {
        try { fn(notice); } catch (_) { /* swallow */ }
    });
}

// ─── Mock Response Generators ───────────────────────────────────────

const mockResponses = {
    phase1b: (payload) => ({
        adapter: 'phase1b',
        adapter_name: 'Phase 1B — Inpatient Watch & Wait',
        model: 'medgemma-27b + phase1b_lora_v2.1',
        timestamp: new Date().toISOString(),
        patient_id: payload.patient_id || 'UNKNOWN',
        inference_time_ms: 842,

        // Backend-schema fields (so pages can always read them)
        request_id: `mock-${Date.now()}`,
        mode: 'demo',
        fallback_used: false,
        fallback_reason: null,

        risk_assessment: {
            overall_risk: 'AMBER',
            risk_score: 0.62,
            confidence: 0.87,
            risk_category: 'Moderate — requires monitoring',
        },

        clinical_summary:
            'Post-operative day 3 partial nephrectomy patient presenting with mild tachycardia (HR 98), low-grade fever (37.8°C), and increasing wound erythema. Drain output trending upward. While individual findings are non-specific, the combination warrants close monitoring for evolving surgical site infection or early hemorrhage. Current labs show leukocytosis (WBC 12.3) and mild creatinine elevation (1.4) which may reflect renal adaptation post-partial nephrectomy.',

        recommendations: [
            { priority: 'high', action: 'Serial wound assessment every 4 hours with documentation of erythema extent' },
            { priority: 'high', action: 'Repeat CBC and CMP in 6 hours to assess WBC and creatinine trend' },
            { priority: 'medium', action: 'Monitor drain output color and volume hourly — flag if >250mL/8hr or frankly bloody' },
            { priority: 'medium', action: 'Maintain adequate hydration — target UOP >0.5mL/kg/hr' },
            { priority: 'low', action: 'Consider CT abdomen if creatinine continues to rise or drain output changes character' },
        ],

        triggers: [
            'Low-grade fever (37.8°C)',
            'Tachycardia (HR 98)',
            'Leukocytosis (WBC 12.3)',
            'Rising creatinine (1.4 from baseline 1.1)',
            'Increasing drain output',
            'Wound erythema',
        ],

        missing_info: [
            'Baseline creatinine (pre-operative)',
            'Drain fluid analysis (cell count, culture)',
            'Prior 24h fluid balance',
            'Most recent imaging results',
        ],

        escalation_criteria: [
            'Temperature >38.5°C',
            'Heart rate >110 or new sustained tachycardia',
            'Drain output >300mL/8hr or frankly hemorrhagic',
            'Creatinine >2.0 or rising >0.3/24hr',
            'New hemodynamic instability',
            'Wound dehiscence or purulent drainage',
        ],

        raw_model_output: {
            logits: { safe: 0.38, monitor: 0.42, escalate: 0.20 },
            attention_summary: 'High attention on: drain_output_trend, wound_status, wbc_value, creatinine_delta',
            adapter_version: '2.1.0',
            base_model: 'medgemma-27b-v1',
        },
    }),

    phase2: (payload) => ({
        adapter: 'phase2',
        adapter_name: 'Phase 2 — SAFEGUARD Post-Discharge',
        model: 'medgemma-27b + safeguard_phase2_v1.8',
        timestamp: new Date().toISOString(),
        patient_id: payload.patient_id || 'UNKNOWN',
        inference_time_ms: 1103,

        request_id: `mock-${Date.now()}`,
        mode: 'demo',
        fallback_used: false,
        fallback_reason: null,

        risk_assessment: {
            overall_risk: 'RED',
            risk_score: 0.89,
            confidence: 0.93,
            risk_category: 'High Risk — urgent clinical review required',
        },

        clinical_summary:
            'Day 8 post-discharge sigmoid resection patient with alarming symptom trajectory. Worsening abdominal pain (7/10, trending up from 3), new fever (38.5°C × 3 days), vomiting, and absent bowel function for 48 hours. This constellation of findings is highly concerning for anastomotic leak or intra-abdominal abscess. The SAFEGUARD algorithm identifies 4 red flags exceeding the automatic escalation threshold. Immediate surgical evaluation is recommended.',

        recommendations: [
            { priority: 'urgent', action: 'IMMEDIATE: Contact surgical team for urgent evaluation' },
            { priority: 'urgent', action: 'Obtain CT abdomen/pelvis with IV and oral contrast' },
            { priority: 'high', action: 'NPO status — discontinue oral intake' },
            { priority: 'high', action: 'IV access and fluid resuscitation' },
            { priority: 'high', action: 'Broad-spectrum IV antibiotics per institutional protocol' },
            { priority: 'medium', action: 'Labs: CBC, CMP, CRP, lactate, blood cultures × 2' },
        ],

        triggers: [
            'Pain escalation: 3→7/10 over 5 days',
            'Fever >38°C × 3 consecutive days',
            'Vomiting × 2 episodes today',
            'No bowel movement for 48 hours',
            'Worsening trend across multiple parameters',
            'Red flag count: 4 (threshold: 2)',
        ],

        missing_info: [
            'Abdominal exam findings',
            'Current lab values',
            'CT imaging',
            'Wound site assessment',
        ],

        escalation_criteria: [
            '⚠️ THRESHOLD MET — Automatic escalation triggered',
            'Fever + pain escalation + absent bowel function',
            'Multiple red flags present simultaneously',
            'Patient safety concern: potential anastomotic leak',
        ],

        patient_guidance: {
            message: 'Based on your symptoms today, we recommend you contact your surgical team right away or go to the nearest emergency department. Your symptoms need to be evaluated urgently.',
            severity: 'urgent',
            action_items: [
                'Do not eat or drink anything until seen by a doctor',
                'Go to the emergency department or call your surgeon now',
                'Bring your medication list and discharge papers',
                'If you develop sudden severe pain or dizziness, call 911',
            ],
        },

        raw_model_output: {
            logits: { safe: 0.05, monitor: 0.06, escalate: 0.89 },
            attention_summary: 'High attention on: pain_trend_slope, fever_duration, bowel_function_absence, vomiting_new_onset',
            safeguard_score: 0.89,
            red_flag_count: 4,
            auto_escalation: true,
            adapter_version: '1.8.0',
            base_model: 'medgemma-27b-v1',
        },
    }),

    onc: (payload) => ({
        adapter: 'onc',
        adapter_name: 'Onco Surveillance Adapter',
        model: 'medgemma-27b + onco_surveillance_v3.0',
        timestamp: new Date().toISOString(),
        patient_id: payload.patient_id || 'UNKNOWN',
        inference_time_ms: 1287,

        request_id: `mock-${Date.now()}`,
        mode: 'demo',
        fallback_used: false,
        fallback_reason: null,

        risk_assessment: {
            overall_risk: 'GREEN',
            risk_score: 0.15,
            confidence: 0.91,
            risk_category: 'Low Risk — on expected trajectory',
        },

        clinical_summary:
            'Three-month post-resection surveillance for stage IIB colon adenocarcinoma shows favorable trajectory. CEA trending down (4.5 → 3.2 → 2.8), within normal limits. CT imaging negative for recurrence with expected post-surgical changes only. MSS status and negative nodes (0/18) confer favorable prognosis. Patient tolerating CAPOX cycle 2 well with minimal side effects. Quality of life score 78/100 is satisfactory. No features suggesting acute surgical concern (phase1b_compat: clear).',

        recommendations: [
            { priority: 'routine', action: 'Continue current adjuvant CAPOX regimen per protocol' },
            { priority: 'routine', action: 'Next CEA in 3 months' },
            { priority: 'routine', action: 'CT chest/abdomen/pelvis at 6-month mark' },
            { priority: 'routine', action: 'Colonoscopy at 1-year post-resection' },
            { priority: 'low', action: 'Assess chemotherapy side effects at each visit — monitor for neuropathy' },
        ],

        triggers: [
            'Favorable CEA trend (declining)',
            'Clean surveillance imaging',
            'Good quality of life score (78/100)',
            'Adequate treatment tolerance',
        ],

        missing_info: [
            'Genetic/molecular panel results (if not yet completed)',
            'Family history details for Lynch syndrome screening',
        ],

        escalation_criteria: [
            'CEA rise >2x from nadir',
            'New lesion on imaging',
            'Unexplained weight loss >5% in 3 months',
            'New or worsening symptoms suggesting recurrence',
            'Treatment intolerance requiring dose modification',
        ],

        surveillance_schedule: {
            next_cea: '2026-05-15',
            next_imaging: '2026-08-15',
            next_colonoscopy: '2026-11-15',
            current_phase: 'Active treatment + surveillance',
        },

        phase1b_compat: {
            acute_surgical_concerns: false,
            note: 'No acute post-surgical findings detected. Patient is beyond the acute recovery window.',
        },

        raw_model_output: {
            logits: { no_recurrence: 0.85, indeterminate: 0.12, recurrence_suspected: 0.03 },
            attention_summary: 'High attention on: cea_trend, imaging_findings, pathology_staging, treatment_response',
            adapter_version: '3.0.0',
            base_model: 'medgemma-27b-v1',
        },
    }),
};

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Run inference against a MedGemma adapter.
 *
 * If VITE_BACKEND_URL is configured, calls the real backend.
 * - On success, checks for fallback_used / mode:"demo" and notifies listeners.
 * - On network/5xx failure, falls back to local mock data and notifies.
 *
 * If VITE_BACKEND_URL is NOT set, uses local mock data directly.
 *
 * @param {Object} params
 * @param {string} params.adapter  - 'phase1b' | 'phase2' | 'onco'
 * @param {Object} params.payload  - Case data (varies per adapter)
 * @param {string} [params.patient_id] - Optional patient ID
 * @returns {Promise<Object>} Adapter response
 */
export async function runInference({ adapter, payload, patient_id }) {
    // If a real backend URL is configured, call the correct endpoint
    if (BACKEND_URL) {
        const endpointMap = {
            phase1b: '/infer/phase1b',
            phase2: '/infer/phase2',
            onco: '/infer/onco',
        };
        const endpoint = endpointMap[adapter];
        if (!endpoint) throw new Error(`Unknown adapter: ${adapter}`);

        // Build request body matching the Pydantic schema
        const body = {
            case_text: payload.free_text || payload.case_text || JSON.stringify(payload),
        };
        if (patient_id) body.patient_id = patient_id;
        if (adapter === 'phase2') {
            if (payload.post_op_day != null) body.post_op_day = payload.post_op_day;
            if (payload.daily_checkin) body.checkin = payload.daily_checkin;
            if (payload.clinical_context?.days_post_discharge != null) {
                body.post_op_day = payload.clinical_context.days_post_discharge;
            }
        }

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 120_000);

            const response = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (!response.ok) {
                // Try to parse error JSON from body
                let errorMsg = `Backend error: ${response.status}`;
                try {
                    const errBody = await response.json();
                    if (errBody.error) errorMsg = errBody.error;
                } catch (_) { /* no JSON body */ }
                throw new Error(errorMsg);
            }

            const result = await response.json();

            // ── Check for backend-side fallback ──
            if (result.fallback_used || (result.mode === 'demo' && BACKEND_URL)) {
                _notifyFallback({
                    type: 'warning',
                    title: 'Real model unavailable — showing Demo output',
                    message: result.fallback_reason || 'Backend returned demo output',
                    requestId: result.request_id,
                });
            }

            return result;

        } catch (err) {
            // ── Network / timeout / unrecoverable error → local mock fallback ──
            console.warn('[mockApi] Backend unreachable, falling back to mock:', err.message);

            _notifyFallback({
                type: 'error',
                title: 'Backend unreachable — showing Demo output',
                message: err.message,
            });

            // Fall through to local mock below
        }
    }

    // Default Mock Fallback if no URL or failure
    return new Promise((resolve) => {
        setTimeout(() => {
            const generator = mockResponses[adapter] || mockResponses.phase1b;
            resolve({ data: generator(payload), demo: true });
        }, 800);
    });
}

/**
 * Run Safety Reviewer against a BASE model.
 * 
 * @param {Object} params
 * @param {string} params.mode - 'phase1b' | 'phase2' | 'onco'
 * @param {Object} params.case_payload - Raw input data
 * @param {Object} params.adapter_output - Processed adapter JSON
 * @returns {Promise<Object>} Reviewer response
 */
export async function runReviewer({ mode, case_payload, adapter_output }) {
    if (BACKEND_URL) {
        try {
            const response = await fetch(`${BACKEND_URL}/infer/reviewer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    case_payload,
                    adapter_output
                }),
            });

            if (response.ok) {
                return await response.json();
            }
        } catch (err) {
            console.warn('[mockApi] Reviewer backend failed, falling back to mock:', err.message);
        }
    }

    // Default Fallback / Demo for Reviewer
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                reviewer_summary: "Reviewer (Demo Mode): Observations are consistent with adapter output. No critical safety overrides required.",
                contradictions: [],
                missed_red_flags: [],
                hallucinations: [],
                escalation_recommended: false,
                confidence: 0.85
            });
        }, 800);
    });
}

/**
 * Adapter metadata — useful for UI display
 */
export const adapterMeta = {
    phase1b: {
        id: 'phase1b',
        name: 'Phase 1B — Inpatient Watch & Wait',
        shortName: 'Phase 1B',
        purpose: 'Continuous inpatient monitoring during post-operative recovery. Detects early signs of complications requiring intervention.',
        where: 'Inpatient surgical wards',
        color: '#3B82F6',
        icon: '🏥',
    },
    phase2: {
        id: 'phase2',
        name: 'Phase 2 — SAFEGUARD Post-Discharge',
        shortName: 'Phase 2',
        purpose: 'Post-discharge surveillance using daily patient check-ins. Identifies deterioration early and triggers automatic escalation when red flags are detected.',
        where: 'Post-discharge / Home recovery',
        color: '#8B5CF6',
        icon: '🏠',
    },
    onco: {
        id: 'onco',
        name: 'Onco Surveillance Adapter',
        shortName: 'Onco',
        purpose: 'Long-term oncological surveillance post-resection. Tracks tumor markers, imaging, treatment response, and quality of life metrics.',
        where: 'Oncology follow-up clinics',
        color: '#10B981',
        icon: '🔬',
    },
};
