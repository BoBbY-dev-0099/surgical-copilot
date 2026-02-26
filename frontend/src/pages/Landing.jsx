import { Link } from 'react-router-dom';
import { Activity, Brain, Workflow, Zap, BarChart3, Stethoscope, User, ExternalLink, Info } from 'lucide-react';

export default function Landing() {
    return (
        <div className="landing-page">

            {/* Hero */}
            <section className="landing-hero">
                <div className="landing-hero-inner">
                    <p className="landing-tagline">AI-assisted surgical monitoring platform</p>
                    <h1 className="landing-h1">
                        Clinical intelligence for every<br />
                        <span className="landing-h1-accent">patient, every day.</span>
                    </h1>
                    <p className="landing-desc">
                        SurgicalCopilot monitors post-surgical patients continuously, flags risks early,
                        and delivers AI-powered recommendations — all in one clean interface.
                    </p>
                    <div className="landing-cta-row">
                        <Link to="/doctor" className="landing-role-btn landing-role-btn--doctor">
                            I'm a Doctor
                        </Link>
                        <Link to="/patient" className="landing-role-btn landing-role-btn--patient">
                            I'm a Patient
                        </Link>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="landing-features">
                <div className="landing-features-grid">
                    <div className="landing-feature-card">
                        <div className="landing-feature-icon"><Activity size={28} /></div>
                        <h3>Real-time monitoring</h3>
                        <p>Daily check-ins with symptom tracking, vitals, and flag detection.</p>
                    </div>
                    <div className="landing-feature-card">
                        <div className="landing-feature-icon"><Brain size={28} /></div>
                        <h3>AI analysis</h3>
                        <p>MedGemma 27B + clinical adapters surface risks and generate structured care plans.</p>
                    </div>
                    <div className="landing-feature-card">
                        <div className="landing-feature-icon"><Workflow size={28} /></div>
                        <h3>Clinical workflows</h3>
                        <p>Doctor and patient portals built for clinical-grade usability.</p>
                    </div>
                </div>
            </section>

            {/* Adapters section */}
            <section className="landing-adapters-section">
                <div className="landing-section-inner">
                    <h2 className="landing-section-title">Three Clinical Adapters</h2>
                    <p className="landing-section-desc">
                        Each adapter solves a distinct clinical problem with MedGemma 27B + LoRA fine-tuning.
                    </p>
                    <div className="landing-adapters-grid">
                        <div className="landing-adapter-card" style={{ '--accent': '#7C3AED' }}>
                            <div className="lac-icon"><Stethoscope size={28} /></div>
                            <h3>Phase 1 — Inpatient</h3>
                            <p className="lac-subtitle">Operate now · Watch & wait · Avoid</p>
                            <p className="lac-desc">
                                Analyzes serial labs, vitals, and imaging of post-operative inpatients
                                to recommend the correct surgical escalation pathway.
                            </p>
                            <div className="lac-metrics">
                                <span className="lac-metric"><strong>100%</strong> F1</span>
                                <span className="lac-metric"><strong>100%</strong> Recall</span>
                            </div>
                        </div>
                        <div className="landing-adapter-card" style={{ '--accent': '#059669' }}>
                            <div className="lac-icon"><Activity size={28} /></div>
                            <h3>SAFEGUARD — Post-Discharge</h3>
                            <p className="lac-subtitle">Green · Amber · Red risk scoring</p>
                            <p className="lac-desc">
                                Processes patient-reported outcomes after hospital discharge to classify
                                recovery risk and auto-generate SBAR escalation reports.
                            </p>
                            <div className="lac-metrics">
                                <span className="lac-metric"><strong>94.2%</strong> Red Recall</span>
                                <span className="lac-metric"><strong>98%</strong> Schema</span>
                            </div>
                        </div>
                        <div className="landing-adapter-card" style={{ '--accent': '#DC2626' }}>
                            <div className="lac-icon"><BarChart3 size={28} /></div>
                            <h3>Oncology Surveillance</h3>
                            <p className="lac-subtitle">Stable · Possible · Confirmed progression</p>
                            <p className="lac-desc">
                                Integrates CT imaging findings, tumor markers, and clinical status
                                to classify disease progression and generate MDT-ready reports.
                            </p>
                            <div className="lac-metrics">
                                <span className="lac-metric"><strong>100%</strong> Schema</span>
                                <span className="lac-metric"><strong>100%</strong> Parse</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick links */}
            <section className="landing-links-section">
                <div className="landing-section-inner">
                    <div className="landing-links-grid landing-links-grid--3">
                        <Link to="/agent" className="landing-link-card">
                            <span className="llc-icon"><Zap size={24} /></span>
                            <h3>Clinical Agent</h3>
                            <p>Upload notes, FHIR, or dictate — the agent autonomously routes and chains tools.</p>
                            <span className="llc-cta">Run Agent →</span>
                        </Link>
                        <Link to="/doctor" className="landing-link-card">
                            <span className="llc-icon"><Stethoscope size={24} /></span>
                            <h3>Doctor Portal</h3>
                            <p>Longitudinal monitoring dashboard — patient timeline, AI copilot, SBAR approvals.</p>
                            <span className="llc-cta">Open Portal →</span>
                        </Link>
                        <Link to="/patient" className="landing-link-card">
                            <span className="llc-icon"><User size={24} /></span>
                            <h3>Patient Check-in</h3>
                            <p>Daily symptom check-in with AI risk scoring, trend charts, and recovery guidance.</p>
                            <span className="llc-cta">Check in →</span>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
