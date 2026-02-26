import { Link } from 'react-router-dom';

export default function About() {
    return (
        <div>
            <div className="landing-topbar">
                <Link to="/" style={{ color: 'inherit' }}><h1>⚕️ Surgical Copilot</h1></Link>
                <nav className="landing-nav">
                    <Link to="/doctor">Doctor Portal</Link>
                    <Link to="/patient">Patient Portal</Link>
                    <Link to="/playground">Playground</Link>
                    <Link to="/about">About</Link>
                </nav>
            </div>

            <div className="about-page">
                <h2>About Surgical Copilot</h2>
                <p>
                    Surgical Copilot is multi-phase clinical surveillance platform powered by
                    <strong> MedGemma</strong> — with specialized LoRA adapters for each stage of post-surgical care.
                    From inpatient monitoring to post-discharge safety to long-term oncological surveillance,
                    it provides AI-assisted decision support throughout the entire surgical journey.
                </p>

                <h3>How It Works</h3>
                <p>
                    The system uses a base MedGemma foundation model enhanced with three purpose-built adapters.
                    Each adapter is fine-tuned for a specific clinical context and returns structured JSON outputs
                    that clinicians can review, validate, and act upon.
                </p>
                <ul>
                    <li><strong>Phase 1B — Inpatient Watch & Wait:</strong> Continuous monitoring for post-operative complications. Analyzes vitals, labs, drain output, and wound status to detect early signs of SSI, hemorrhage, or organ dysfunction.</li>
                    <li><strong>Phase 2 — SAFEGUARD Post-Discharge:</strong> Patient-reported symptom tracking with automatic red-flag detection. Identifies post-discharge deterioration (anastomotic leak, infection, readmission risk) from daily check-in data.</li>
                    <li><strong>Onco Surveillance:</strong> Long-term cancer follow-up tracking tumor markers (CEA, CA 15-3), imaging results, treatment response, and quality of life metrics. Includes Phase 1B backward-compatibility for acute surgical concerns.</li>
                </ul>

                <h3>Architecture</h3>
                <p>
                    The frontend communicates with a single inference endpoint. The backend routes requests
                    to the appropriate adapter based on the <code>adapter</code> field in the request body.
                    This design makes it straightforward to add new adapters or swap the base model.
                </p>
                <pre className="json-viewer" style={{ marginBottom: 16 }}>{`POST /infer
{
  "adapter": "phase1b" | "phase2" | "onco",
  "payload": { ... },
  "patient_id": "PT-001" (optional)
}`}</pre>

                <h3>Safety & Disclaimers</h3>
                <p>
                    Surgical Copilot is a <strong>clinical decision support tool</strong>.
                    It does not replace clinical judgment, and the treating clinician remains solely
                    responsible for all patient care decisions.
                </p>
                <ul>
                    <li>AI recommendations must be validated by a qualified healthcare professional before action.</li>
                    <li>The system may produce incorrect, incomplete, or inappropriate recommendations.</li>
                    <li>Do not use for emergency triage or life-threatening situations without clinical oversight.</li>
                    <li>Patient data handling must comply with applicable regulations (HIPAA, GDPR, etc.).</li>
                    <li>This is a research / demonstration prototype and is not FDA-cleared or CE-marked.</li>
                </ul>

                <h3>Technical Stack</h3>
                <ul>
                    <li>Frontend: React + Vite</li>
                    <li>Charts: Recharts</li>
                    <li>Base model: MedGemma-27B</li>
                    <li>Adapters: LoRA fine-tuned for each clinical phase</li>
                    <li>API: RESTful JSON — designed for easy backend swap</li>
                </ul>

                <div className="disclaimer-bar" style={{ marginTop: 28 }}>
                    ⚠️ <strong>Research Prototype</strong> — This application is for demonstration and research purposes only.
                    Not intended for clinical use without proper validation, regulatory review, and institutional approval.
                </div>
            </div>
        </div>
    );
}
