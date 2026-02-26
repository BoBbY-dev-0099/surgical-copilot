/**
 * Reality-anchored synthetic case payloads for each adapter (3 per adapter = 9 total).
 * Based on published clinical literature distributions (CODA trial, ACS-NSQIP, NCCN guidelines).
 *
 * NOTE: No demo outputs are included. All inference must come from the real backend.
 * When the GPU is off and the site is live, add cached real inference outputs here.
 */

// ═══════════════════════════════════════════════════════════════════
// PHASE 1B — Inpatient Surgical Triage (3 cases)
// ═══════════════════════════════════════════════════════════════════

export const PH1B_001 = {
  label: 'Uncomplicated Appendicitis — Watch & Wait',
  sublabel: 'CODA trial criteria, antibiotic-first candidate',
  badge: 'watch_wait',
  value: 'ph1b_001',
  patient: { name: 'Synthetic Patient A', age: 28, sex: 'M', procedure: 'Appendicitis evaluation', pod: 0 },
  data: {
    patient_id: 'PH1B-001',
    case_text: '28M presenting with RLQ pain x18 hours. CT shows uncomplicated appendicitis - 9mm appendix, no perforation, no abscess. Alvarado score 5. Vitals: T 37.8°C, HR 88, BP 124/78. Labs: WBC 12.4, CRP 45. Patient hemodynamically stable, candidate for antibiotic-first management per CODA trial criteria.',
  },
  timelineSeries: [{ hour: 0, wbc: 12.4, crp: 45, temp_c: 37.8, pain: 5 }],
  expectedOutput: {
    label_class: 'watch_wait', trajectory: 'stable', red_flag_triggered: false, red_flags: [],
    confidence: 0.85, clinical_rationale: 'Uncomplicated appendicitis meeting CODA criteria for antibiotic-first management.',
  },
};

export const PH1B_002 = {
  label: 'POD4 Sepsis + Infected Collection — Operate Now',
  sublabel: 'Sepsis-3 criteria, source control needed',
  badge: 'operate_now',
  value: 'ph1b_002',
  patient: { name: 'Synthetic Patient B', age: 70, sex: 'F', procedure: 'Robotic partial nephrectomy', pod: 4 },
  data: {
    patient_id: 'PH1B-002',
    case_text: '70F POD4 robotic partial nephrectomy. Progressive deterioration over 48h despite IV antibiotics. Current: T 39.2°C, HR 118, BP 94/58, RR 24. qSOFA 2/3. Labs: WBC 19.8 (was 13.9 POD2), CRP 245, lactate 3.4. CT: 5.8cm perinephric collection with gas locules, rim enhancement. Source control needed.',
  },
  timelineSeries: [
    { day: 2, wbc: 13.9, crp: 88, lactate: 1.6, temp_c: 37.9 },
    { day: 3, wbc: 16.8, crp: 145, lactate: 2.1, temp_c: 38.4 },
    { day: 4, wbc: 19.8, crp: 245, lactate: 3.4, temp_c: 39.2 },
  ],
  expectedOutput: {
    label_class: 'operate_now', trajectory: 'deteriorating', red_flag_triggered: true,
    red_flags: ['sepsis_criteria_met', 'source_control_needed', 'lactate_elevated', 'imaging_gas', 'wbc_critical'],
  },
};

export const PH1B_003 = {
  label: 'Metastatic Cancer + Perforation — Avoid Surgery',
  sublabel: 'DNR/DNI, comfort measures, palliative pathway',
  badge: 'avoid',
  value: 'ph1b_003',
  patient: { name: 'Synthetic Patient C', age: 82, sex: 'M', procedure: 'Palliative consultation', pod: 0 },
  data: {
    patient_id: 'PH1B-003',
    case_text: '82M with metastatic pancreatic cancer (liver mets, ECOG 4), now with perforated duodenal ulcer. Free air on imaging. Goals of care discussion completed - patient and family elected DNR/DNI, comfort measures only. Not a surgical candidate due to: (1) prohibitive operative risk (albumin 2.1, ECOG 4), (2) terminal malignancy with weeks prognosis, (3) patient wishes. Palliative care consulted.',
  },
  timelineSeries: [],
  expectedOutput: {
    label_class: 'avoid', trajectory: 'deteriorating', red_flag_triggered: false, red_flags: [],
    avoid_reason: 'goals_of_care_comfort_only',
  },
};

// ═══════════════════════════════════════════════════════════════════
// PHASE 2 — SAFEGUARD Post-Discharge (3 cases)
// ═══════════════════════════════════════════════════════════════════

export const PH2_001 = {
  label: 'Day 6 Post-Cholecystectomy — Green',
  sublabel: 'Expected recovery, all markers normal',
  badge: 'green',
  value: 'ph2_001',
  patient: { name: 'Synthetic Patient D', age: 45, sex: 'F', procedure: 'Laparoscopic cholecystectomy', pod: 6 },
  data: {
    patient_id: 'PH2-001',
    case_text: 'Day 6 post-laparoscopic cholecystectomy. Daily check-in: pain 2/10, temp 36.8°C, no nausea, bowel function normal, appetite good, wound clean and dry, mobility normal, mood good. Medication adherence confirmed.',
    checkin: { post_discharge_day: 6, pain_0_10: 2, temp_c: 36.8, wound_status: 'clean_dry', bowel_function: true, appetite: 'good', mobility: 'normal' },
  },
  timelineSeries: [
    { day: 1, riskScore: 0.30, temp: 37.4, pain: 5 },
    { day: 3, riskScore: 0.22, temp: 37.0, pain: 3 },
    { day: 6, riskScore: 0.12, temp: 36.8, pain: 2 },
  ],
  expectedOutput: {
    label_class: 'green', risk_score: 0.12, trajectory: 'improving', red_flag_triggered: false,
    domain_flags: { pain: 'normal', fever: 'none', wound: 'normal', bowel: 'normal', mobility: 'normal' },
  },
};

export const PH2_002 = {
  label: 'Day 10 Post-Colectomy — Amber',
  sublabel: 'Mild wound erythema, low-grade fever',
  badge: 'amber',
  value: 'ph2_002',
  patient: { name: 'Synthetic Patient E', age: 66, sex: 'M', procedure: 'Right hemicolectomy', pod: 10 },
  data: {
    patient_id: 'PH2-002',
    case_text: 'Day 10 post-right hemicolectomy. Daily check-in: pain 4/10, temp 37.6°C, wound showing mild erythema with minimal serous drainage, bowel function present, appetite fair, mobility reduced.',
    checkin: { post_discharge_day: 10, pain_0_10: 4, temp_c: 37.6, wound_status: 'erythema_mild', wound_drainage: 'serous_minimal', bowel_function: true, appetite: 'fair', mobility: 'reduced' },
  },
  timelineSeries: [
    { day: 5, riskScore: 0.20, temp: 37.0, pain: 3 },
    { day: 8, riskScore: 0.35, temp: 37.3, pain: 3 },
    { day: 10, riskScore: 0.48, temp: 37.6, pain: 4 },
  ],
  expectedOutput: {
    label_class: 'amber', risk_score: 0.48, trajectory: 'stable', red_flag_triggered: false,
    domain_flags: { pain: 'elevated', fever: 'low_grade', wound: 'concerning', bowel: 'normal', mobility: 'reduced' },
  },
};

export const PH2_003 = {
  label: 'Day 8 Post-LAR — Red (Anastomotic Leak)',
  sublabel: 'Feculent drain, fever, urgent ED evaluation',
  badge: 'red',
  value: 'ph2_003',
  patient: { name: 'Synthetic Patient F', age: 62, sex: 'M', procedure: 'Low anterior resection', pod: 8 },
  data: {
    patient_id: 'PH2-003',
    // Simplified case text to reduce token requirements
    case_text: 'POD8 LAR. Pain 8/10, temp 38.9°C, HR 112, feculent drain. Emergency.',
    checkin: { 
      post_discharge_day: 8, 
      pain_0_10: 8, 
      temp_c: 38.9,
      heart_rate: 112,
      drain_output: 'feculent',
      mobility: 'bedbound'
    },
  },
  timelineSeries: [
    { day: 5, riskScore: 0.18, temp: 37.0, pain: 3 },
    { day: 7, riskScore: 0.55, temp: 38.2, pain: 6 },
    { day: 8, riskScore: 0.89, temp: 38.9, pain: 8 },
  ],
  expectedOutput: {
    label_class: 'red', 
    risk_score: 0.89, 
    trajectory: 'deteriorating', 
    red_flag_triggered: true,
    trigger_reason: 'anastomotic_leak_concern',
    domain_flags: { pain: 'severe', fever: 'high', wound: 'not_assessed', bowel: 'concerning', mobility: 'severely_reduced' },
  },
};

// ═══════════════════════════════════════════════════════════════════
// ONC — Oncology Surveillance (3 cases)
// ═══════════════════════════════════════════════════════════════════

export const ONC_001 = {
  label: '3-Month Surveillance — Stable Disease',
  sublabel: 'CEA normalized, no recurrence',
  badge: 'stable_disease',
  value: 'onc_001',
  patient: { name: 'Synthetic Patient G', age: 64, sex: 'M', procedure: 'Right hemicolectomy', pod: 90 },
  data: {
    patient_id: 'ONC-001',
    case_text: '64M with Stage IIIB colon cancer (T3N1M0), s/p right hemicolectomy 3 months ago. Completed adjuvant FOLFOX (6 cycles). Surveillance visit today. CEA: 2.1 (down from pre-op 12.4). CT C/A/P: No evidence of recurrence, stable post-surgical changes. Patient doing well clinically, ECOG 0.',
    tumor_markers: { cea_baseline: 12.4, cea_current: 2.1, cea_trend: 'declining' },
  },
  timelineSeries: [
    { month: 0, cea: 12.4, riskScore: 0.40 },
    { month: 1, cea: 5.2, riskScore: 0.25 },
    { month: 3, cea: 2.1, riskScore: 0.15 },
  ],
  expectedOutput: {
    label_class: 'stable_disease', progression_status: 'stable_disease', recist_alignment: 'SD',
    confidence: 0.91, risk_score: 0.15, cea_assessment: 'normalized', imaging_assessment: 'no_recurrence',
  },
};

export const ONC_002 = {
  label: '9-Month Surveillance — Possible Progression',
  sublabel: 'Rising CEA, indeterminate liver lesion',
  badge: 'possible_progression',
  value: 'onc_002',
  patient: { name: 'Synthetic Patient H', age: 59, sex: 'F', procedure: 'Sigmoid colectomy', pod: 270 },
  data: {
    patient_id: 'ONC-002',
    case_text: '59F Stage II colon cancer, s/p sigmoid colectomy 9 months ago. No adjuvant therapy (low-risk Stage II). Surveillance visit. CEA rising: 3.2→8.7 over 3 months. CT shows new 1.2cm indeterminate liver lesion segment VI. MRI recommended.',
    tumor_markers: { cea_6mo: 3.2, cea_current: 8.7, cea_trend: 'rising', cea_doubling_time_months: 4.2 },
  },
  timelineSeries: [
    { month: 3, cea: 2.8, riskScore: 0.20 },
    { month: 6, cea: 3.2, riskScore: 0.28 },
    { month: 9, cea: 8.7, riskScore: 0.58 },
  ],
  expectedOutput: {
    label_class: 'possible_progression', progression_status: 'possible_progression', recist_alignment: 'indeterminate',
    confidence: 0.72, risk_score: 0.58, cea_assessment: 'concerning_rise', imaging_assessment: 'indeterminate_lesion',
  },
};

export const ONC_003 = {
  label: '14-Month Surveillance — Confirmed Progression',
  sublabel: 'Multiple liver mets, urgent tumor board',
  badge: 'confirmed_progression',
  value: 'onc_003',
  patient: { name: 'Synthetic Patient I', age: 66, sex: 'M', procedure: 'Right hemicolectomy', pod: 420 },
  data: {
    patient_id: 'ONC-003',
    case_text: '66M Stage IIIC colon cancer, s/p right hemicolectomy 14 months ago with adjuvant FOLFOX. 14-month surveillance. CEA markedly elevated at 45.2 (was 4.1 at 9 months). CT/PET confirm multiple liver metastases (3 lesions, largest 2.8cm), liver-only disease. Tumor board scheduled.',
    tumor_markers: { cea_9mo: 4.1, cea_current: 45.2, cea_trend: 'markedly_elevated' },
  },
  timelineSeries: [
    { month: 6, cea: 3.2, riskScore: 0.22 },
    { month: 9, cea: 4.1, riskScore: 0.28 },
    { month: 14, cea: 45.2, riskScore: 0.82 },
  ],
  expectedOutput: {
    label_class: 'confirmed_progression', progression_status: 'confirmed_progression', recist_alignment: 'PD',
    confidence: 0.96, risk_score: 0.82, cea_assessment: 'markedly_elevated', imaging_assessment: 'new_metastases_confirmed',
  },
};

// ═══════════════════════════════════════════════════════════════════
// Exports and utility functions
// ═══════════════════════════════════════════════════════════════════

export const SAMPLE_MAP = {
  phase1b: [PH1B_001, PH1B_002, PH1B_003],
  phase2: [PH2_001, PH2_002, PH2_003],
  onc: [ONC_001, ONC_002, ONC_003],
};

export function getExpectedOutput(adapter, caseValueOrPatientId) {
  const cases = SAMPLE_MAP[adapter] || [];
  const c = cases.find(s => s.value === caseValueOrPatientId || s.data?.patient_id === caseValueOrPatientId);
  return c?.expectedOutput || null;
}

export function getTimelineSeries(adapter, caseValueOrPatientId) {
  const cases = SAMPLE_MAP[adapter] || [];
  const c = cases.find(s => s.value === caseValueOrPatientId || s.data?.patient_id === caseValueOrPatientId);
  return c?.timelineSeries || null;
}

// Legacy exports for backward compatibility
export const PH1B_KIDNEY_001 = PH1B_001;
export const PH1B_KIDNEY_002 = PH1B_002;
export const PH1B_AVOID_001 = PH1B_003;
export const PH2_KIDNEY_001 = PH2_001;
export const PH2_AMBER_001 = PH2_002;
export const PH2_KIDNEY_002 = PH2_003;
export const ONC_COLON_001 = ONC_001;
export const ONC_AMBER_001 = ONC_002;
export const ONC_COLON_002 = ONC_003;

export const SAMPLE_PHASE1B_KIDNEY_ADENOMA = PH1B_001.data;
export const SAMPLE_ONC_COLON_CANCER = ONC_001.data;
export const SAMPLE_PHASE2_CHECKIN = PH2_003.data;
