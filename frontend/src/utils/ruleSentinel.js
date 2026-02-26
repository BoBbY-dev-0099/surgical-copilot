/**
 * Rule Sentinel (JS) — simple thresholds, best-effort extraction
 * 
 * Logic to check for critical thresholds in patient data.
 */

export function runRuleSentinel(mode, payload) {
    const results = {
        triggered: false,
        triggers: [],
        skipped_reason: null
    };

    try {
        if (mode === 'phase2') {
            const checkin = payload.daily_checkin || payload.checkin || {};

            // Temperature Check (Celsius)
            if (checkin.temp_c >= 38.0) {
                results.triggers.push(`High Temperature: ${checkin.temp_c}°C`);
            }

            // Pain Level (0-10)
            if (checkin.pain_0_10 >= 7) {
                results.triggers.push(`Severe Pain Level: ${checkin.pain_0_10}/10`);
            }

            // Wound / Breathing (Best effort strings)
            if (checkin.wound?.redness === 'increasing' || checkin.wound?.drainage === 'purulent') {
                results.triggers.push(`Concerning Wound Status: ${checkin.wound.redness || 'abnormal drainage'}`);
            }
            if (checkin.breathing?.shortness_of_breath) {
                results.triggers.push("Shortness of Breath detected");
            }

            if (results.triggers.length === 0 && Object.keys(checkin).length === 0) {
                results.skipped_reason = "no structured check-in data found";
            }
        }
        else if (mode === 'phase1b') {
            // Best effort extraction from clinical notes or hypothetical 'series' payload
            // In repo structure, phase1b often sends clinical_text or a rich payload.
            // If the payload has structured vitals (like in the storage/derived logic seen in backend)
            const vitals = payload.vitals || payload.latest_vitals || {};

            if (vitals.temp_c >= 38.0) results.triggers.push(`Fever: ${vitals.temp_c}°C`);
            if (vitals.hr >= 120) results.triggers.push(`Tachycardia: ${vitals.hr} bpm`);
            if (vitals.sbp < 90 && vitals.sbp > 0) results.triggers.push(`Hypotension: SBP ${vitals.sbp}`);

            const labs = payload.labs || payload.latest_labs || {};
            if (labs.wbc >= 12 || (labs.wbc <= 4 && labs.wbc > 0)) {
                results.triggers.push(`Abnormal WBC: ${labs.wbc}`);
            }
            if (labs.creatinine_delta >= 0.3) {
                results.triggers.push("AKI Risk: Significant creatinine rise detected");
            }

            if (results.triggers.length === 0 && Object.keys(vitals).length === 0 && Object.keys(labs).length === 0) {
                results.skipped_reason = "no structured vitals/labs found";
            }
        }
        else if (mode === 'onc' || mode === 'onco') {
            const tumor = payload.tumor_markers || payload.markers || {};
            const imaging = payload.imaging || payload.lesions || {};
            const symptoms = payload.symptoms || {};

            // CEA threshold (ng/mL) - rising CEA is concerning for recurrence
            if (tumor.cea >= 5.0) {
                results.triggers.push(`Elevated CEA: ${tumor.cea} ng/mL (threshold: 5.0)`);
            }
            // CEA velocity - rapid rise is more concerning than absolute value
            if (tumor.cea_delta_percent >= 25) {
                results.triggers.push(`Rapid CEA rise: +${tumor.cea_delta_percent}% from baseline`);
            }

            // CA 19-9 for pancreatic/biliary (U/mL)
            if (tumor.ca19_9 >= 37) {
                results.triggers.push(`Elevated CA 19-9: ${tumor.ca19_9} U/mL`);
            }

            // Lesion growth per RECIST 1.1 criteria
            // Progressive Disease: ≥20% increase in sum of target lesions
            if (imaging.sum_diameter_change_percent >= 20) {
                results.triggers.push(`RECIST Progressive Disease: +${imaging.sum_diameter_change_percent}% lesion growth`);
            }
            // New lesions indicate progression
            if (imaging.new_lesion_count > 0) {
                results.triggers.push(`New lesions detected: ${imaging.new_lesion_count}`);
            }
            // Individual lesion growth >5mm is clinically significant
            if (imaging.max_lesion_growth_mm >= 5) {
                results.triggers.push(`Significant lesion growth: +${imaging.max_lesion_growth_mm}mm`);
            }

            // Symptom red flags for oncology
            if (symptoms.unintended_weight_loss_percent >= 5) {
                results.triggers.push(`Unintended weight loss: ${symptoms.unintended_weight_loss_percent}%`);
            }
            if (symptoms.new_pain_site) {
                results.triggers.push(`New pain site: ${symptoms.new_pain_site}`);
            }
            if (symptoms.performance_status_decline) {
                results.triggers.push("Performance status decline detected");
            }

            if (results.triggers.length === 0 && 
                Object.keys(tumor).length === 0 && 
                Object.keys(imaging).length === 0 &&
                Object.keys(symptoms).length === 0) {
                results.skipped_reason = "no structured tumor markers/imaging/symptoms found";
            }
        }
        else {
            results.skipped_reason = `Rule Sentinel not configured for mode: ${mode}`;
        }

        // Wearable data augmentation (applies to all modes)
        const wearable = payload.wearable || payload.wearable_vitals || {};
        if (Object.keys(wearable).length > 0) {
            if (wearable.heart_rate >= 120) results.triggers.push(`Wearable: Tachycardia ${wearable.heart_rate} bpm`);
            if (wearable.heart_rate <= 40 && wearable.heart_rate > 0) results.triggers.push(`Wearable: Severe Bradycardia ${wearable.heart_rate} bpm`);
            if (wearable.spo2 <= 90 && wearable.spo2 > 0) results.triggers.push(`Wearable: Critical SpO2 ${wearable.spo2}%`);
            if (wearable.spo2 <= 94 && wearable.spo2 > 90) results.triggers.push(`Wearable: Low SpO2 ${wearable.spo2}%`);
            if (wearable.hrv <= 10 && wearable.hrv >= 0) results.triggers.push(`Wearable: Critically low HRV ${wearable.hrv}ms (autonomic stress)`);
            if (wearable.temperature >= 38.5) results.triggers.push(`Wearable: Fever ${wearable.temperature}°C`);
            if (wearable.resp_rate >= 28) results.triggers.push(`Wearable: Tachypnea ${wearable.resp_rate} breaths/min`);
            if (wearable.steps !== undefined && wearable.steps <= 200) results.triggers.push(`Wearable: Severe immobility (${wearable.steps} steps)`);
        }

        results.triggered = results.triggers.length > 0;
        return results;

    } catch (err) {
        console.error("Rule Sentinel Error:", err);
        return { ...results, skipped_reason: `Error: ${err.message}` };
    }
}
