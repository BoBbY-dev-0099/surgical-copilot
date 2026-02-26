# Surgical Copilot - Live Inference Screenshots

Visual documentation of real AI inference using MedGemma-27B with LoRA adapters.

## Screenshots Overview

### Landing & Navigation
| # | File | Description |
|---|------|-------------|
| 01 | `01_landing_page.png` | Main landing page with role-based entry |
| 02 | `02_clinical_agent_overview.png` | Clinical AI Agent pipeline overview |
| 03 | `03_patient_pipeline_manager.png` | Patient management across care phases |

### FHIR & Data Intake
| # | File | Description |
|---|------|-------------|
| 04 | `04_fhir_r4_integration.png` | FHIR R4 bundle import from Epic/Cerner |
| 16 | `16_voice_medasr_input.png` | MedASR voice input with transcript |
| 17 | `17_text_pdf_input.png` | Text/PDF document intake |

### AI Agent Execution
| # | File | Description |
|---|------|-------------|
| 05 | `05_agent_trace_routing.png` | Phase routing with confidence scores |
| 06 | `06_multi_tool_synthesis.png` | Multi-tool synthesis & MedGemma-4B enrichment |
| 07 | `07_hitl_safety_gate.png` | Human-in-the-Loop safety gate |
| 14 | `14_agent_state_pipeline.png` | Tool latencies & final resolution |
| 15 | `15_tool_split_transparency.png` | Model output vs enriched output separation |

### Clinical Output
| # | File | Description |
|---|------|-------------|
| 08 | `08_clinical_assessment.png` | Synthesized clinical assessment |
| 09 | `09_ai_clinical_output.png` | Full AI output with WATCH & WAIT decision |
| 10 | `10_patient_message.png` | Patient-facing message & self-care instructions |
| 11 | `11_full_schema_primary.png` | Full schema - primary determinants |
| 12 | `12_scoring_sepsis_screen.png` | NEWS2 & qSOFA scoring |
| 13 | `13_raw_json_output.png` | Raw JSON model output |

### Doctor Portal
| # | File | Description |
|---|------|-------------|
| 18 | `18_doctor_portal_overview.png` | Patient overview with vitals & labs |
| 19 | `19_doctor_ai_analysis.png` | AI analysis tab |
| 20 | `20_voice_analysis_running.png` | Live voice analysis processing |

### Patient Portal
| # | File | Description |
|---|------|-------------|
| 21 | `21_patient_portal_recovery.png` | Recovery hub with status |
| 22 | `22_daily_checkin_form.png` | Daily symptom check-in form |
| 25 | `25_checkin_warning_signs.png` | Check-in showing concerning symptoms |

### Wearable Integration
| # | File | Description |
|---|------|-------------|
| 23 | `23_wearable_normal.png` | Wearable monitor - normal state (all green) |
| 24 | `24_wearable_deteriorating.png` | **CRITICAL**: Deteriorating state with anomaly detection |

## Key Evidence Points

### 1. Real AI Inference
- Screenshots 05-06 show actual MedGemma-27B routing and processing
- Screenshot 14 shows real latencies (triage: 640ms, phase1b: 1007ms, sentinel: 310ms, medgemma_4b: 820ms)

### 2. Safety Architecture
- Screenshot 07: HITL gate requires clinician approval
- Screenshot 12: Rule Sentinel with NEWS2/qSOFA scoring
- Screenshot 15: Clear separation of model output vs deterministic enrichment

### 3. EHR Integration
- Screenshot 04: FHIR R4 import with 17 resources from Epic MyChart simulation
- Auto-detection of clinical phase

### 4. Wearable Anomaly Detection
- Screenshot 23: Normal baseline (all 7 metrics green)
- Screenshot 24: Deteriorating patient - SpO2 89% (Critical), Temp 38.6°C (Critical), HR 106 (Warning)
- Risk assessment: "2 critical, 5 warnings - Suggested: escalate to RED"

## Technology Stack

- **Core Model**: MedGemma-27B with 3 LoRA adapters
- **Enrichment**: MedGemma-4B for SBAR, patient messages, vision
- **Voice**: MedASR medical speech recognition
- **EHR**: FHIR R4 (Epic/Cerner compatible)
- **Frontend**: React + TypeScript
- **Backend**: FastAPI + Python
