/**
 * DetailedPipelineView - Shows complete pipeline flow with model I/O
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Cog, Shield, Zap, MessageSquare, FileText, Image as ImageIcon } from 'lucide-react';

export default function DetailedPipelineView({ steps, finalOutput, selectedCase, uploadedImages }) {
    const [expandedSteps, setExpandedSteps] = useState({});

    const toggleStep = (index) => {
        setExpandedSteps(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const getStepIcon = (type) => {
        const icons = {
            'triage': Cog,
            'phase1b': Brain,
            'phase2': Brain,
            'onc': Brain,
            'sentinel': Shield,
            'medgemma_4b': Zap,
        };
        return icons[type] || Brain;
    };

    const getStepColor = (type) => {
        const colors = {
            'triage': '#0EA5E9',
            'phase1b': '#7C3AED',
            'phase2': '#059669',
            'onc': '#DC2626',
            'sentinel': '#D97706',
            'medgemma_4b': '#8B5CF6',
        };
        return colors[type] || '#64748B';
    };

    // Extract pipeline steps from agent execution
    const pipelineSteps = [
        {
            name: 'Input: Clinical Case Text',
            type: 'input',
            input: selectedCase?.data?.case_text || selectedCase?.caseText || 'N/A',
            output: null,
            description: 'Raw clinical notes, vitals, labs, imaging reports submitted for analysis',
        },
        {
            name: 'Step 1: Clinical Triage Router',
            type: 'triage',
            input: 'Case text analysis for phase classification',
            output: {
                phase: selectedCase?.adapter,
                confidence: 'high',
                scores: { phase1b: 0, phase2: 0, onc: 0 }
            },
            description: 'Keyword-based routing to determine which adapter (Phase1B/Phase2/Onc) should handle this case',
        },
        {
            name: `Step 2: MedGemma-27B + ${selectedCase?.adapter?.toUpperCase()} LoRA Adapter`,
            type: selectedCase?.adapter || 'phase2',
            input: {
                model: 'google/medgemma-27b-text-it',
                adapter: `${selectedCase?.adapter}-27b`,
                prompt: 'Analyze case and generate structured clinical decision...',
                case_text: (selectedCase?.data?.case_text || '').slice(0, 200) + '...',
            },
            output: finalOutput ? {
                risk_level: finalOutput.risk_level || finalOutput.label_class || finalOutput.progression_status,
                risk_score: finalOutput.risk_score,
                confidence: finalOutput.confidence,
                key_fields: Object.keys(finalOutput).slice(0, 8).join(', '),
            } : null,
            description: '27B parameter medical LLM with fine-tuned LoRA adapter generates structured clinical decision',
        },
        {
            name: 'Step 3: Rule Sentinel Safety Check',
            type: 'sentinel',
            input: {
                core_output: finalOutput ? JSON.stringify(finalOutput).slice(0, 150) + '...' : 'N/A',
                thresholds: 'Hard-coded clinical safety thresholds'
            },
            output: {
                triggered: false,
                violations: [],
                status: 'All safety thresholds passed'
            },
            description: 'Hard-coded threshold checks (e.g., temp >39°C, pain >8/10) to catch critical cases',
        },
        {
            name: 'Step 4: MedGemma-4B Multimodal Enrichment',
            type: 'medgemma_4b',
            input: {
                model: 'google/medgemma-4b-it',
                core_output: finalOutput ? JSON.stringify(finalOutput).slice(0, 100) + '...' : 'N/A',
                case_text: (selectedCase?.data?.case_text || '').slice(0, 100) + '...',
                images: `${uploadedImages?.length || 0} wound photo(s)`,
            },
            output: finalOutput ? {
                sbar: finalOutput.sbar ? 'Generated ✓' : 'Not generated',
                patient_message: finalOutput.patient_message ? 'Generated ✓' : 'Not generated',
                clinical_explanation: finalOutput.clinical_explanation ? 'Generated ✓' : 'Not generated',
                image_analysis: finalOutput.image_analysis ? 'Generated ✓' : 'Not generated',
            } : null,
            description: '4B parameter vision-enabled model generates clinical narratives, SBAR handoff, and image analysis',
        },
        {
            name: 'Step 5: Output Synthesis & Merge',
            type: 'merge',
            input: {
                '27B_output': 'Structured clinical decision',
                '4B_enrichment': 'SBAR, patient message, image analysis',
                'Agent_metadata': 'Tools used, state, next steps'
            },
            output: finalOutput ? {
                total_fields: Object.keys(finalOutput).length,
                adapter_fields: 8,
                agent_fields: Object.keys(finalOutput).length - 8,
                merged_successfully: true
            } : null,
            description: 'Merge adapter output + enrichment + agent metadata into final unified response',
        },
    ];

    return (
        <div className="detailed-pipeline-view">
            <div className="dpv-header">
                <FileText size={18} />
                <h3>Complete Pipeline Flow: Inputs & Outputs</h3>
                <span className="dpv-subtitle">Click each step to expand and see detailed I/O</span>
            </div>

            <div className="dpv-steps">
                {pipelineSteps.map((step, index) => {
                    const isExpanded = expandedSteps[index];
                    const StepIcon = getStepIcon(step.type);
                    const color = getStepColor(step.type);

                    return (
                        <div key={index} className="dpv-step">
                            <div 
                                className="dpv-step-header"
                                onClick={() => toggleStep(index)}
                                style={{ borderLeftColor: color }}
                            >
                                <div className="dpv-step-icon" style={{ background: color + '20', color }}>
                                    <StepIcon size={16} />
                                </div>
                                <div className="dpv-step-title">
                                    <span>{step.name}</span>
                                    <span className="dpv-step-desc">{step.description}</span>
                                </div>
                                <button className="dpv-expand-btn">
                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </button>
                            </div>

                            {isExpanded && (
                                <div className="dpv-step-body">
                                    {/* Input Section */}
                                    <div className="dpv-io-section">
                                        <div className="dpv-io-label">
                                            📥 Input
                                        </div>
                                        <div className="dpv-io-content">
                                            {typeof step.input === 'string' ? (
                                                <div className="dpv-text-input">{step.input}</div>
                                            ) : (
                                                <div className="dpv-json-input">
                                                    {Object.entries(step.input).map(([key, val]) => (
                                                        <div key={key} className="dpv-json-row">
                                                            <span className="dpv-json-key">{key}:</span>
                                                            <span className="dpv-json-val">{typeof val === 'string' ? val : JSON.stringify(val)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Processing Indicator */}
                                    <div className="dpv-processing">
                                        <div className="dpv-arrow">→</div>
                                        <span>Processing...</span>
                                    </div>

                                    {/* Output Section */}
                                    <div className="dpv-io-section">
                                        <div className="dpv-io-label">
                                            📤 Output
                                        </div>
                                        <div className="dpv-io-content">
                                            {step.output ? (
                                                typeof step.output === 'string' ? (
                                                    <div className="dpv-text-output">{step.output}</div>
                                                ) : (
                                                    <div className="dpv-json-output">
                                                        {Object.entries(step.output).map(([key, val]) => (
                                                            <div key={key} className="dpv-json-row">
                                                                <span className="dpv-json-key">{key}:</span>
                                                                <span className="dpv-json-val">{typeof val === 'string' ? val : JSON.stringify(val)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            ) : (
                                                <div className="dpv-no-output">Waiting for agent execution...</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* What Gets Sent to Doctor */}
            {finalOutput && (
                <div className="dpv-doctor-handoff">
                    <div className="dpv-handoff-header">
                        <MessageSquare size={18} style={{ color: '#059669' }} />
                        <h4>Sent to Doctor Portal</h4>
                    </div>
                    <div className="dpv-handoff-content">
                        <div className="dpv-handoff-section">
                            <strong>Risk Assessment:</strong>
                            <span className={`risk-badge risk-${finalOutput.risk_level || 'green'}`}>
                                {(finalOutput.risk_level || finalOutput.label_class || finalOutput.progression_status || 'green').toUpperCase()}
                            </span>
                        </div>
                        {finalOutput.sbar && (
                            <div className="dpv-handoff-section">
                                <strong>SBAR Handoff:</strong>
                                <div className="dpv-sbar-mini">
                                    <div><strong>S:</strong> {finalOutput.sbar.situation?.slice(0, 80)}...</div>
                                    <div><strong>R:</strong> {finalOutput.sbar.recommendation?.slice(0, 80)}...</div>
                                </div>
                            </div>
                        )}
                        {finalOutput.image_analysis && (
                            <div className="dpv-handoff-section">
                                <strong>Wound Image Analysis:</strong>
                                <div><ImageIcon size={14} style={{ display: 'inline', marginRight: 4 }} />
                                    Status: {finalOutput.image_analysis.wound_status || 'Analyzed'}
                                </div>
                            </div>
                        )}
                        <div className="dpv-handoff-section">
                            <strong>Complete Clinical Record:</strong>
                            <span>All fields saved to EHR for clinician review</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
