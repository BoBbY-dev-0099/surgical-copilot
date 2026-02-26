// Sample evidence data for demo purposes
// Add this to your backend response or use for testing

export const SAMPLE_EVIDENCE_DATA = {
  phase2: {
    red: {
      evidence: [
        {
          source: "VITALS",
          finding: "Temperature 38.9°C indicates fever, HR 112 suggests systemic response"
        },
        {
          source: "DRAIN",
          finding: "Feculent output highly suggestive of bowel content leak"
        },
        {
          source: "PAIN",
          finding: "Severe diffuse abdominal pain (8/10) indicates peritoneal irritation"
        },
        {
          source: "TIMELINE",
          finding: "POD 8 timing consistent with anastomotic leak presentation window"
        },
        {
          source: "PATTERN",
          finding: "Combination of fever, tachycardia, and feculent drain pathognomonic for leak"
        }
      ]
    },
    amber: {
      evidence: [
        {
          source: "WOUND",
          finding: "Mild erythema with serous drainage suggests superficial infection"
        },
        {
          source: "VITALS",
          finding: "Low-grade fever 37.6°C requires monitoring"
        },
        {
          source: "PAIN",
          finding: "Pain level 4/10 slightly elevated for POD 10"
        }
      ]
    },
    green: {
      evidence: [
        {
          source: "VITALS",
          finding: "Temperature 36.8°C within normal range"
        },
        {
          source: "WOUND",
          finding: "Clean and dry incision site indicates proper healing"
        },
        {
          source: "FUNCTION",
          finding: "Normal bowel function and good appetite suggest recovery on track"
        }
      ]
    }
  },
  phase1b: {
    operate_now: {
      evidence: [
        {
          source: "LABS",
          finding: "WBC 19.8 with left shift, CRP 245 indicates severe inflammation"
        },
        {
          source: "IMAGING",
          finding: "5.8cm collection with gas locules confirms abscess requiring drainage"
        },
        {
          source: "SEPSIS",
          finding: "qSOFA 2/3, lactate 3.4 meets Sepsis-3 criteria"
        },
        {
          source: "VITALS",
          finding: "Hypotension 94/58, tachycardia 118, fever 39.2°C"
        },
        {
          source: "TRAJECTORY",
          finding: "Progressive deterioration despite 48h IV antibiotics"
        }
      ]
    },
    watch_wait: {
      evidence: [
        {
          source: "IMAGING",
          finding: "9mm appendix without perforation or abscess"
        },
        {
          source: "LABS",
          finding: "WBC 12.4, CRP 45 - mild elevation only"
        },
        {
          source: "CLINICAL",
          finding: "Hemodynamically stable, Alvarado score 5"
        },
        {
          source: "CRITERIA",
          finding: "Meets CODA trial inclusion for antibiotic-first approach"
        }
      ]
    },
    avoid: {
      evidence: [
        {
          source: "ONCOLOGY",
          finding: "Metastatic pancreatic cancer with liver involvement"
        },
        {
          source: "FUNCTIONAL",
          finding: "ECOG 4, albumin 2.1 indicates poor reserve"
        },
        {
          source: "GOALS",
          finding: "DNR/DNI status, comfort measures only per family discussion"
        },
        {
          source: "PROGNOSIS",
          finding: "Weeks life expectancy, prohibitive operative risk"
        }
      ]
    }
  },
  onc: {
    confirmed_progression: {
      evidence: [
        {
          source: "MARKERS",
          finding: "CEA rise from 4.1 to 45.2 indicates disease progression"
        },
        {
          source: "IMAGING",
          finding: "Multiple new liver metastases, largest 2.8cm"
        },
        {
          source: "PET",
          finding: "FDG-avid liver lesions confirm metabolically active disease"
        },
        {
          source: "RECIST",
          finding: "Sum diameter increase >20% meets PD criteria"
        },
        {
          source: "PATTERN",
          finding: "Liver-only disease pattern amenable to directed therapy"
        }
      ]
    },
    possible_progression: {
      evidence: [
        {
          source: "MARKERS",
          finding: "CEA rising from 3.2 to 8.7 over 3 months"
        },
        {
          source: "IMAGING",
          finding: "New 1.2cm liver lesion, indeterminate characteristics"
        },
        {
          source: "KINETICS",
          finding: "CEA doubling time 4.2 months suggests active disease"
        },
        {
          source: "FOLLOWUP",
          finding: "MRI recommended for lesion characterization"
        }
      ]
    },
    stable_disease: {
      evidence: [
        {
          source: "MARKERS",
          finding: "CEA normalized from 12.4 to 2.1"
        },
        {
          source: "IMAGING",
          finding: "No evidence of recurrent disease on CT"
        },
        {
          source: "CLINICAL",
          finding: "ECOG 0, excellent functional status"
        },
        {
          source: "TIMELINE",
          finding: "3 months post-op, completed adjuvant therapy"
        }
      ]
    }
  }
};

// Function to add evidence to your response
export function enrichResponseWithEvidence(adapter, response) {
  const riskLevel = response.risk_level || response.label_class || response.progression_status;
  const evidenceMap = SAMPLE_EVIDENCE_DATA[adapter];
  
  if (evidenceMap && evidenceMap[riskLevel]) {
    response.evidence = evidenceMap[riskLevel].evidence;
  }
  
  return response;
}