/**
 * Synthetic patient data aligned with the 9 reality-anchored cases.
 * One patient per adapter for v1Api fallback + PatientPortal + DoctorPortal.
 */

import { SAMPLE_MAP } from './mockCases';

const MOCK_PATIENTS = [
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1B — Uncomplicated Appendicitis (Watch & Wait)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'PH1B-001',
        name: 'Synthetic Patient A',
        age: 28,
        sex: 'M',
        procedure: 'Appendicitis evaluation',
        indication: 'Uncomplicated appendicitis - CODA trial candidate',
        pod: 0,
        risk: 'green',
        adapter: 'phase1b',
        lastUpdated: '12 min ago',
        summary: 'Uncomplicated appendicitis meeting CODA trial criteria. Antibiotic-first candidate. Hemodynamically stable.',
        redFlags: [],
        vitals: { temp: 37.8, hr: 88, bp: '124/78', rr: 16, spo2: 98 },
        labs: { wbc: 12.4, crp: 45 },
        timeline: [{ hour: 0, wbc: 12.4, crp: 45, temp: 37.8, pain: 5 }],
        caseText: SAMPLE_MAP.phase1b[0].data.case_text,
        notesHistory: [],
        orders: [],
        checkinHistory: [],
        alertsSent: [],
        planChecklist: ['Monitor WBC/CRP trend', 'Continue IV antibiotics', 'Reassess in 12 hours', 'Surgery if deterioration'],
        followupAppointment: null,
    },
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1B — POD4 Sepsis + Infected Collection (Operate Now)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'PH1B-002',
        name: 'Synthetic Patient B',
        age: 70,
        sex: 'F',
        procedure: 'Robotic partial nephrectomy',
        indication: 'Perinephric collection with sepsis',
        pod: 4,
        risk: 'red',
        adapter: 'phase1b',
        lastUpdated: '5 min ago',
        summary: 'POD4 sepsis with infected perinephric collection. qSOFA 2/3, lactate 3.4. Source control needed.',
        redFlags: ['sepsis_criteria_met', 'source_control_needed', 'lactate_elevated', 'imaging_gas'],
        vitals: { temp: 39.2, hr: 118, bp: '94/58', rr: 24, spo2: 94 },
        labs: { wbc: 19.8, crp: 245, lactate: 3.4 },
        timeline: [
            { day: 2, wbc: 13.9, crp: 88, lactate: 1.6, temp: 37.9 },
            { day: 3, wbc: 16.8, crp: 145, lactate: 2.1, temp: 38.4 },
            { day: 4, wbc: 19.8, crp: 245, lactate: 3.4, temp: 39.2 },
        ],
        caseText: SAMPLE_MAP.phase1b[1].data.case_text,
        notesHistory: [
            { at: '2026-02-23 09:00', author: 'Dr. Arishenskey', summary: 'POD4 — Sepsis-3 criteria met. CT shows 5.8cm gas-containing collection. Urgent source control required.', sbar: { s: 'POD4 partial nephrectomy with sepsis and infected collection', b: 'Progressive deterioration despite IV antibiotics. qSOFA 2/3, lactate 3.4', a: 'Sepsis-3 criteria met. Infected perinephric collection requiring source control.', r: 'Immediate IR drainage vs. surgical washout. ICU transfer.' } },
        ],
        orders: [
            { id: 'o1', label: 'Blood cultures x2 STAT', status: 'active', due: 'STAT' },
            { id: 'o2', label: 'Broad-spectrum antibiotics', status: 'active' },
            { id: 'o3', label: 'Surgical/IR consult for source control', status: 'pending', due: 'Urgent' },
        ],
        checkinHistory: [],
        alertsSent: [
            { date: '2026-02-23 08:00', message: 'Sepsis criteria met — urgent surgical review required' },
        ],
        planChecklist: ['Source control (IR drain vs surgical washout)', 'ICU transfer', 'Continue resuscitation', 'Serial lactate monitoring'],
        followupAppointment: null,
    },
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1B — Metastatic Cancer + Perforation (Avoid Surgery)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'PH1B-003',
        name: 'Synthetic Patient C',
        age: 82,
        sex: 'M',
        procedure: 'Palliative consultation',
        indication: 'Metastatic pancreatic cancer + perforated duodenal ulcer',
        pod: 0,
        risk: 'amber',
        adapter: 'phase1b',
        lastUpdated: '30 min ago',
        summary: 'Terminal metastatic pancreatic cancer, ECOG 4, DNR/DNI. Perforated duodenal ulcer. Comfort measures only.',
        redFlags: [],
        vitals: { temp: 37.4, hr: 96, bp: '105/62', rr: 20, spo2: 95 },
        labs: { wbc: 15.2, albumin: 2.1 },
        timeline: [],
        caseText: SAMPLE_MAP.phase1b[2].data.case_text,
        notesHistory: [
            { at: '2026-02-23 08:00', author: 'Dr. Palliative', summary: 'Goals of care confirmed: comfort measures only. DNR/DNI. Not a surgical candidate.' },
        ],
        orders: [],
        checkinHistory: [],
        alertsSent: [],
        planChecklist: ['Continue palliative care', 'Symptom management', 'Family support'],
        followupAppointment: null,
    },
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2 — Day 6 Post-Cholecystectomy (Green)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'PH2-001',
        name: 'Synthetic Patient D',
        age: 45,
        sex: 'F',
        procedure: 'Laparoscopic cholecystectomy',
        indication: 'Acute cholecystitis',
        pod: 6,
        risk: 'green',
        adapter: 'phase2',
        lastUpdated: '3 hr ago',
        summary: 'Day 6 post-lap chole. All recovery markers within expected range. Pain decreasing, afebrile, wound clean.',
        redFlags: [],
        vitals: { temp: 36.8, hr: 72, bp: '118/72', rr: 14, spo2: 99 },
        labs: {},
        timeline: [
            { day: 1, riskScore: 0.30, temp: 37.4, pain: 5 },
            { day: 3, riskScore: 0.22, temp: 37.0, pain: 3 },
            { day: 6, riskScore: 0.12, temp: 36.8, pain: 2 },
        ],
        caseText: SAMPLE_MAP.phase2[0].data.case_text,
        dailyCheckin: { pain_score: 2, temperature: 36.8, wound_status: 'clean_dry', bowel_function: true, appetite: 'good', mobility: 'normal' },
        notesHistory: [
            { at: '2026-02-23 08:00', author: 'Copilot AI', summary: 'Day 6 check-in: All parameters within expected range. Recovery on track.' },
        ],
        orders: [],
        checkinHistory: [
            { date: '2026-02-18', pain: 5, nausea: 1, fatigue: 4, temp: 37.4, flags: [] },
            { date: '2026-02-20', pain: 3, nausea: 0, fatigue: 3, temp: 37.0, flags: [] },
            { date: '2026-02-23', pain: 2, nausea: 0, fatigue: 2, temp: 36.8, flags: [] },
        ],
        alertsSent: [],
        planChecklist: ['Continue routine recovery', 'Next check-in in 24 hours', 'Follow-up at 2 weeks'],
        followupAppointment: { date: '2026-03-09', time: '2:00 PM', location: 'General Surgery Clinic' },
    },
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2 — Day 10 Post-Colectomy (Amber)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'PH2-002',
        name: 'Synthetic Patient E',
        age: 66,
        sex: 'M',
        procedure: 'Right hemicolectomy',
        indication: 'Colon cancer',
        pod: 10,
        risk: 'amber',
        adapter: 'phase2',
        lastUpdated: '1 hr ago',
        summary: 'Day 10 post-colectomy. Mild wound erythema with serous drainage. Low-grade fever. Possible early SSI.',
        redFlags: [],
        vitals: { temp: 37.6, hr: 82, bp: '134/82', rr: 18, spo2: 97 },
        labs: { wbc: 11.2, crp: 68 },
        timeline: [
            { day: 5, riskScore: 0.20, temp: 37.0, pain: 3 },
            { day: 8, riskScore: 0.35, temp: 37.3, pain: 3 },
            { day: 10, riskScore: 0.48, temp: 37.6, pain: 4 },
        ],
        caseText: SAMPLE_MAP.phase2[1].data.case_text,
        dailyCheckin: { pain_score: 4, temperature: 37.6, wound_status: 'erythema_mild', wound_drainage: 'serous_minimal', bowel_function: true, appetite: 'fair', mobility: 'reduced' },
        notesHistory: [
            { at: '2026-02-23 09:00', author: 'Copilot AI', summary: 'Day 10: Mild wound erythema and low-grade fever. Recommend increased monitoring.' },
        ],
        orders: [],
        checkinHistory: [
            { date: '2026-02-18', pain: 3, nausea: 0, fatigue: 3, temp: 37.0, flags: [] },
            { date: '2026-02-21', pain: 3, nausea: 0, fatigue: 3, temp: 37.3, flags: [] },
            { date: '2026-02-23', pain: 4, nausea: 0, fatigue: 4, temp: 37.6, flags: ['Wound', 'Fever'] },
        ],
        alertsSent: [],
        planChecklist: ['Increase check-in frequency to q12h', 'Wound photo requested', 'Consider clinic visit if worsening'],
        followupAppointment: { date: '2026-02-26', time: '10:00 AM', location: 'Colorectal Surgery Clinic' },
    },
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2 — Day 8 Post-LAR (Red — Anastomotic Leak)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'PH2-003',
        name: 'Synthetic Patient F',
        age: 62,
        sex: 'M',
        procedure: 'Low anterior resection',
        indication: 'Rectal cancer',
        pod: 8,
        risk: 'red',
        adapter: 'phase2',
        lastUpdated: '5 min ago',
        summary: 'Day 8 post-LAR with classic anastomotic leak presentation. Feculent drain output, high fever, severe pain. Requires immediate ED evaluation.',
        redFlags: ['anastomotic_leak_concern', 'feculent_drain', 'fever_high', 'pain_severe'],
        vitals: { temp: 38.9, hr: 112, bp: '118/72', rr: 22, spo2: 95 },
        labs: { wbc: 16.2, crp: 185, lactate: 2.8 },
        timeline: [
            { day: 5, riskScore: 0.18, temp: 37.0, pain: 3 },
            { day: 7, riskScore: 0.55, temp: 38.2, pain: 6 },
            { day: 8, riskScore: 0.89, temp: 38.9, pain: 8 },
        ],
        caseText: SAMPLE_MAP.phase2[2].data.case_text,
        dailyCheckin: { pain_score: 8, pain_location: 'diffuse_abdominal', temperature: 38.9, heart_rate: 112, nausea_vomiting: true, bowel_function: false, drain_output: 'feculent', mobility: 'bedbound' },
        notesHistory: [
            { at: '2026-02-23 06:30', author: 'Copilot AI', summary: 'URGENT: Anastomotic leak suspected. Feculent drain output, sepsis signs. Immediate ED evaluation required.', sbar: { s: 'Day 8 post-LAR patient with clinical picture concerning for anastomotic leak.', b: '62M underwent LAR for rectal cancer. Discharged POD5 with JP drain.', a: 'High clinical suspicion for anastomotic leak: fever 38.9, HR 112, severe pain, feculent drain.', r: 'Immediate ED evaluation. Stat CT abdomen/pelvis. NPO, IV access, surgical team notification.' } },
        ],
        orders: [
            { id: 'o1', label: 'CT abdomen/pelvis with contrast STAT', status: 'active', due: 'STAT' },
            { id: 'o2', label: 'NPO', status: 'active' },
            { id: 'o3', label: 'IV fluid resuscitation', status: 'active' },
            { id: 'o4', label: 'Surgical consult STAT', status: 'pending', due: 'Immediate' },
        ],
        checkinHistory: [
            { date: '2026-02-20', pain: 3, nausea: 0, fatigue: 3, temp: 37.0, flags: [] },
            { date: '2026-02-22', pain: 6, nausea: 1, fatigue: 5, temp: 38.2, flags: ['Fever', 'Pain'] },
            { date: '2026-02-23', pain: 8, nausea: 2, fatigue: 7, temp: 38.9, flags: ['Fever', 'Pain', 'Drain', 'Vomiting'] },
        ],
        alertsSent: [
            { date: '2026-02-23 06:30', message: 'URGENT: Anastomotic leak suspected. Risk score 0.89. Surgical team notified.' },
        ],
        planChecklist: ['Immediate ED evaluation', 'CT abdomen/pelvis with contrast', 'Surgical consultation', 'NPO', 'IV access and resuscitation'],
        followupAppointment: { date: '2026-02-23', time: 'ASAP', location: 'Emergency Department' },
    },
    // ═══════════════════════════════════════════════════════════════════
    // ONC — 3-Month Surveillance (Stable Disease)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'ONC-001',
        name: 'Synthetic Patient G',
        age: 64,
        sex: 'M',
        procedure: 'Right hemicolectomy',
        indication: 'Stage IIIB colon adenocarcinoma (T3N1M0)',
        pod: 90,
        risk: 'green',
        adapter: 'onc',
        lastUpdated: '2 hr ago',
        summary: '3-month surveillance. CEA normalized (12.4 to 2.1). CT no recurrence. ECOG 0. Routine follow-up.',
        redFlags: [],
        vitals: { temp: 36.7, hr: 72, bp: '128/78', rr: 14, spo2: 99 },
        labs: { wbc: 6.8, hgb: 13.2, cr: 0.9, cea: 2.1 },
        timeline: [
            { month: 0, cea: 12.4, riskScore: 0.40 },
            { month: 1, cea: 5.2, riskScore: 0.25 },
            { month: 3, cea: 2.1, riskScore: 0.15 },
        ],
        caseText: SAMPLE_MAP.onc[0].data.case_text,
        notesHistory: [
            { at: '2026-02-23 11:00', author: 'Dr. Oncologist', summary: '3-month surveillance: CEA normalized, CT clear. Continue NCCN guideline surveillance.' },
        ],
        orders: [
            { id: 'o1', label: 'Next CEA in 3 months', status: 'pending', due: '2026-05-23' },
            { id: 'o2', label: 'CT chest/abd/pelvis in 6 months', status: 'pending', due: '2026-08-23' },
            { id: 'o3', label: 'Colonoscopy at 1 year', status: 'pending' },
        ],
        checkinHistory: [],
        alertsSent: [],
        planChecklist: ['Continue surveillance per NCCN guidelines', 'Next CEA in 3 months', 'Next CT in 6 months', 'Colonoscopy at 1 year'],
        followupAppointment: { date: '2026-05-23', time: '10:30 AM', location: 'Oncology Clinic' },
    },
    // ═══════════════════════════════════════════════════════════════════
    // ONC — 9-Month Surveillance (Possible Progression)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'ONC-002',
        name: 'Synthetic Patient H',
        age: 59,
        sex: 'F',
        procedure: 'Sigmoid colectomy',
        indication: 'Stage II colon cancer',
        pod: 270,
        risk: 'amber',
        adapter: 'onc',
        lastUpdated: '1 hr ago',
        summary: '9-month surveillance. Rising CEA (3.2 to 8.7). New 1.2cm indeterminate liver lesion. MRI recommended.',
        redFlags: ['cea_rising', 'indeterminate_liver_lesion'],
        vitals: { temp: 36.8, hr: 76, bp: '132/80', rr: 16, spo2: 98 },
        labs: { wbc: 7.2, hgb: 12.8, cr: 0.8, cea: 8.7 },
        timeline: [
            { month: 3, cea: 2.8, riskScore: 0.20 },
            { month: 6, cea: 3.2, riskScore: 0.28 },
            { month: 9, cea: 8.7, riskScore: 0.58 },
        ],
        caseText: SAMPLE_MAP.onc[1].data.case_text,
        notesHistory: [
            { at: '2026-02-23 09:00', author: 'Dr. Oncologist', summary: '9-month surveillance: Concerning CEA rise and new liver lesion. Expedited MRI recommended.', sbar: { s: '9-month surveillance with rising CEA and indeterminate liver lesion.', b: '59F Stage II sigmoid colon cancer, resected 9 months ago. No adjuvant therapy.', a: 'Possible hepatic metastasis. CEA doubling time ~4.2 months.', r: 'MRI liver. Tumor board discussion. Repeat CEA in 4 weeks.' } },
        ],
        orders: [
            { id: 'o1', label: 'MRI liver with hepatobiliary contrast', status: 'active', due: 'Within 2 weeks' },
            { id: 'o2', label: 'Repeat CEA in 4 weeks', status: 'pending' },
            { id: 'o3', label: 'Tumor board discussion', status: 'pending' },
        ],
        checkinHistory: [],
        alertsSent: [],
        planChecklist: ['MRI liver urgently', 'Tumor board discussion', 'Repeat CEA in 4 weeks', 'Consider PET-CT if MRI indeterminate'],
        followupAppointment: { date: '2026-03-09', time: '2:00 PM', location: 'Oncology Clinic' },
    },
    // ═══════════════════════════════════════════════════════════════════
    // ONC — 14-Month Surveillance (Confirmed Progression)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'ONC-003',
        name: 'Synthetic Patient I',
        age: 66,
        sex: 'M',
        procedure: 'Right hemicolectomy',
        indication: 'Stage IIIC colon cancer — confirmed liver metastases',
        pod: 420,
        risk: 'red',
        adapter: 'onc',
        lastUpdated: '30 min ago',
        summary: '14-month surveillance. CEA 45.2. Multiple liver metastases confirmed on CT/PET. Liver-only disease. Urgent tumor board.',
        redFlags: ['confirmed_metastases', 'cea_markedly_elevated'],
        vitals: { temp: 36.9, hr: 78, bp: '136/82', rr: 16, spo2: 98 },
        labs: { wbc: 8.4, hgb: 12.0, cr: 1.0, cea: 45.2 },
        timeline: [
            { month: 6, cea: 3.2, riskScore: 0.22 },
            { month: 9, cea: 4.1, riskScore: 0.28 },
            { month: 14, cea: 45.2, riskScore: 0.82 },
        ],
        caseText: SAMPLE_MAP.onc[2].data.case_text,
        notesHistory: [
            { at: '2026-02-23 08:00', author: 'Dr. Oncologist', summary: 'URGENT: Confirmed hepatic metastases. Liver-only disease. Tumor board for resectability assessment.', sbar: { s: '14-month surveillance with confirmed hepatic metastases requiring urgent multidisciplinary evaluation.', b: '66M Stage IIIC colon cancer post-resection + adjuvant FOLFOX. Previously normal surveillance.', a: 'Metachronous liver metastases — 3 lesions, liver-only. Potentially resectable pending HPB evaluation.', r: 'Urgent tumor board. HPB surgery consultation. Molecular profiling.' } },
        ],
        orders: [
            { id: 'o1', label: 'Urgent tumor board referral', status: 'active', due: 'This week' },
            { id: 'o2', label: 'HPB surgery consultation', status: 'pending' },
            { id: 'o3', label: 'Molecular profiling (KRAS/NRAS/BRAF/MSI)', status: 'pending' },
        ],
        checkinHistory: [],
        alertsSent: [
            { date: '2026-02-23 08:30', message: 'URGENT: Confirmed liver metastases on surveillance CT/PET. Tumor board scheduled.' },
        ],
        planChecklist: ['Urgent tumor board', 'HPB surgery consultation', 'Molecular profiling', 'Consider neoadjuvant vs upfront resection', 'Staging laparoscopy'],
        followupAppointment: { date: '2026-02-26', time: '9:00 AM', location: 'Multidisciplinary Tumor Board' },
    },
];

export default MOCK_PATIENTS;

/**
 * Build a case payload from a patient record for inference.
 */
export function buildCasePayload(patient) {
    const payload = {
        patient_id: patient.id,
        case_text: patient.caseText,
    };
    if (patient.dailyCheckin) {
        payload.daily_checkin = patient.dailyCheckin;
        payload.post_op_day = patient.pod;
    }
    return payload;
}
