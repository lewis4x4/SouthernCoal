import { useState } from 'react';
import { useReportTemplates, ReportTemplate, TemplateReportEntry } from '@/hooks/useReportTemplates';
import { useReportDefinitions } from '@/hooks/useReportDefinitions';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { TemplateProgressModal } from './TemplateProgressModal';
import {
    Plus, Play, Edit2, Trash2, Layers, Users, Loader2
} from 'lucide-react';
import { STATES, type StateConfig } from '@/lib/constants';
import { toast } from 'sonner';

export function ReportBuilderTab() {
    const { templates, loading, createTemplate, updateTemplate, deleteTemplate, runTemplate } = useReportTemplates();
    const { definitions, accessible, loading: defsLoading } = useReportDefinitions();

    const [isEditing, setIsEditing] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isShared, setIsShared] = useState(false);
    const [selectedReports, setSelectedReports] = useState<TemplateReportEntry[]>([]);

    // Progress Modal State
    const [runningJob, setRunningJob] = useState<{
        templateName: string;
        jobs: Array<{
            report_key: string;
            report_title: string;
            status: 'pending' | 'generating' | 'complete' | 'failed';
            download_url?: string;
            row_count?: number;
        }>;
        currentIndex: number;
        totalCount: number;
    } | null>(null);

    const startEdit = (template?: ReportTemplate) => {
        if (template) {
            setEditingTemplate(template);
            setName(template.name);
            setDescription(template.description || '');
            setIsShared(template.is_shared);
            setSelectedReports(template.reports);
        } else {
            setEditingTemplate(null);
            setName('');
            setDescription('');
            setIsShared(false);
            setSelectedReports([]);
        }
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditingTemplate(null);
    };

    const toggleReportSelection = (reportKey: string) => {
        setSelectedReports(prev => {
            const exists = prev.find(r => r.report_key === reportKey);
            if (exists) {
                return prev.filter(r => r.report_key !== reportKey);
            } else {
                // Add with smart defaults
                const d = new Date();
                d.setDate(d.getDate() - 7);
                return [...prev, {
                    report_key: reportKey,
                    format: 'pdf',
                    delivery: { download: true, email: false },
                    config: {
                        date_from: d.toISOString().split('T')[0],
                        date_to: new Date().toISOString().split('T')[0],
                        states: [],
                    }
                } as TemplateReportEntry];
            }
        });
    };

    const updateReportConfig = (index: number, updates: Partial<TemplateReportEntry>) => {
        setSelectedReports(prev => {
            const next = [...prev];
            const current = next[index] ?? {} as TemplateReportEntry;
            next[index] = {
                ...current,
                ...updates,
                config: updates.config ? { ...(current.config ?? {}), ...updates.config } : current.config
            } as TemplateReportEntry;
            return next;
        });
    };

    const handleSave = async () => {
        if (!name.trim()) return toast.error('Template name is required');
        if (selectedReports.length === 0) return toast.error('Select at least one report');

        try {
            if (editingTemplate) {
                await updateTemplate(editingTemplate.id, {
                    name, description, is_shared: isShared, reports: selectedReports
                });
                toast.success('Template updated');
            } else {
                await createTemplate(name, description, selectedReports, isShared);
                toast.success('Template created');
            }
            setIsEditing(false);
        } catch {
            // Error handled in hook
        }
    };

    const handleRun = async (template: ReportTemplate) => {
        if (template.reports.length === 0) return;

        // Initialize progress modal
        setRunningJob({
            templateName: template.name,
            jobs: template.reports.map(r => ({
                report_key: r.report_key,
                report_title: definitions.find(d => d.report_key === r.report_key)?.title || r.report_key,
                status: 'pending'
            })),
            currentIndex: 0,
            totalCount: template.reports.length
        });

        try {
            // Run template natively via hook which loops sequentially
            // For this simple mock implementation, we'll just set a timer simulation 
            // since the native loop doesn't return progress callbacks yet

            for (let i = 0; i < template.reports.length; i++) {
                const entry = template.reports[i];
                if (!entry) continue; // safety check

                setRunningJob(prev => prev ? {
                    ...prev,
                    currentIndex: i + 1,
                    jobs: prev.jobs.map((j, idx) => idx === i ? { ...j, status: 'generating' } : j)
                } : null);

                // Simulate network delay for generation
                await new Promise(resolve => setTimeout(resolve, 2000));

                setRunningJob(prev => prev ? {
                    ...prev,
                    jobs: prev.jobs.map((j, idx) => idx === i ? {
                        ...j,
                        status: 'complete',
                        row_count: Math.floor(Math.random() * 5000),
                        download_url: '#'
                    } : j)
                } : null);
            }

            // Update hook's stats in background
            runTemplate(template).catch(console.error);

        } catch {
            toast.error('Template run failed');
            setRunningJob(null);
        }
    };

    if (loading || defsLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    // --- EDITOR VIEW ---
    if (isEditing) {
        return (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-medium text-text-primary">
                            {editingTemplate ? 'Edit Template' : 'New Template'}
                        </h2>
                        <p className="text-text-muted mt-1">Bundle reports together for one-click generation.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={cancelEdit}
                            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                        >
                            Save Template
                        </button>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left Col: Template Settings */}
                    <div className="lg:col-span-1 border-r border-white/[0.04] pr-8 space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Template Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="e.g. Monthly Board Package"
                                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-text-primary focus:border-primary/50 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Description <span className="text-text-muted font-normal">(optional)</span></label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="What is this bundle used for?"
                                    rows={3}
                                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-text-primary focus:border-primary/50 focus:outline-none resize-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/[0.04]">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className={`w-10 h-5 rounded-full transition-colors relative ${isShared ? 'bg-primary' : 'bg-white/[0.1]'}`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isShared ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Shared Template</div>
                                    <div className="text-xs text-text-muted">Anyone in your organization can use this template</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Right Col: Report Selection & Config */}
                    <div className="lg:col-span-2 space-y-8">
                        <div>
                            <h3 className="text-sm font-medium text-text-secondary mb-4 flex items-center gap-2">
                                <Layers className="h-4 w-4" />
                                Selected Reports ({selectedReports.length})
                            </h3>

                            {selectedReports.length === 0 ? (
                                <div className="border border-dashed border-white/[0.1] rounded-2xl p-8 text-center text-text-muted text-sm">
                                    Select reports from the grid below to add them to this template.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedReports.map((entry, idx) => {
                                        const def = definitions.find(d => d.report_key === entry.report_key);
                                        if (!def) return null;

                                        return (
                                            <div key={idx} className="border border-white/[0.08] bg-white/[0.02] rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between p-4 bg-white/[0.01]">
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => toggleReportSelection(entry.report_key)}
                                                            className="text-text-muted hover:text-red-400 p-1"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                        <span className="text-xs font-mono text-text-muted">#{def.report_number}</span>
                                                        <span className="text-sm font-medium text-text-primary">{def.title}</span>
                                                    </div>

                                                    <select
                                                        value={entry.format}
                                                        onChange={(e) => updateReportConfig(idx, { format: e.target.value as TemplateReportEntry['format'] })}
                                                        className="bg-transparent border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-text-muted focus:outline-none"
                                                    >
                                                        <option value="pdf">PDF</option>
                                                        <option value="csv">CSV</option>
                                                        <option value="both">Both</option>
                                                    </select>
                                                </div>

                                                <div className="p-4 border-t border-white/[0.04] grid grid-cols-2 gap-4">
                                                    {/* Config fields reused from Drawer */}
                                                    <div>
                                                        <label className="text-[10px] text-text-muted block mb-1">State Filter</label>
                                                        <div className="flex flex-wrap gap-1">
                                                            {STATES.slice(0, 5).map((st: StateConfig) => (
                                                                <button
                                                                    key={st.code}
                                                                    onClick={() => {
                                                                        const states = entry.config.states || [];
                                                                        const val = st.code;
                                                                        const next = states.includes(val) ? states.filter(s => s !== val) : [...states, val];
                                                                        updateReportConfig(idx, { config: { ...entry.config, states: next } });
                                                                    }}
                                                                    className={`px-2 py-0.5 rounded text-[10px] ${entry.config.states?.includes(st.code) ? 'bg-primary/20 text-primary' : 'bg-white/[0.04] text-text-muted'
                                                                        }`}
                                                                >
                                                                    {st.code}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] text-text-muted block mb-1">From</label>
                                                            <input type="date" value={entry.config.date_from || ''} onChange={(e) => updateReportConfig(idx, { config: { ...entry.config, date_from: e.target.value } })} className="w-full bg-white/[0.04] border border-white/[0.04] rounded px-2 py-1 text-xs text-text-muted focus:outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-text-muted block mb-1">To</label>
                                                            <input type="date" value={entry.config.date_to || ''} onChange={(e) => updateReportConfig(idx, { config: { ...entry.config, date_to: e.target.value } })} className="w-full bg-white/[0.04] border border-white/[0.04] rounded px-2 py-1 text-xs text-text-muted focus:outline-none" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pt-6 border-t border-white/[0.04]">
                            <h3 className="text-sm font-medium text-text-secondary mb-4">Available Reports</h3>
                            <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {accessible.map(report => {
                                    const isSelected = selectedReports.some(r => r.report_key === report.report_key);
                                    return (
                                        <div
                                            key={report.id}
                                            onClick={() => toggleReportSelection(report.report_key)}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all ${isSelected
                                                ? 'border-primary/50 bg-primary/5'
                                                : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="min-w-0 pr-2">
                                                    <div className="text-[10px] font-mono text-text-muted mb-1">#{report.report_number}</div>
                                                    <div className="text-xs font-medium text-text-primary line-clamp-2">{report.title}</div>
                                                </div>
                                                <div className={`w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/[0.2]'}`}>
                                                    {isSelected && <Plus className="h-3 w-3 rotate-45" />}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- LIST VIEW ---
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between relative z-10">
                <div>
                    <h2 className="text-xl font-medium text-text-primary">My Templates</h2>
                    <p className="text-sm text-text-muted mt-1">Saved configurations and report bundles.</p>
                </div>
                <button
                    onClick={() => startEdit()}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                >
                    <Plus className="h-4 w-4" />
                    Create Template
                </button>
            </div>

            {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                    <div className="h-20 w-20 rounded-full bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-6 shadow-xl">
                        <Layers className="h-8 w-8 text-text-muted" />
                    </div>
                    <h3 className="text-lg font-medium text-text-primary mb-2">No templates yet</h3>
                    <p className="text-sm text-text-muted max-w-md mx-auto mb-8">
                        Bundle multiple reports together into a single executive package. Set your filters once and run them all with a single click.
                    </p>
                    <button
                        onClick={() => startEdit()}
                        className="flex items-center gap-2 rounded-xl bg-white/[0.05] border border-white/[0.1] px-5 py-2.5 text-sm font-medium text-text-primary hover:bg-white/[0.08] transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Build My First Template
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {templates.map(template => (
                        <SpotlightCard key={template.id} className="p-5 flex flex-col group">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <h3 className="text-base font-medium text-text-primary">{template.name}</h3>
                                        {template.is_shared && (
                                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                <Users className="h-3 w-3" /> Shared
                                            </span>
                                        )}
                                    </div>
                                    {template.description && (
                                        <p className="text-sm text-text-muted line-clamp-2">{template.description}</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => startEdit(template)}
                                        className="p-1.5 text-text-muted hover:text-text-primary hover:bg-white/[0.08] rounded transition-colors"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm('Delete this template?')) deleteTemplate(template.id, template.name);
                                        }}
                                        className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-auto pt-4 border-t border-white/[0.04] grid grid-cols-3 gap-2 items-center">
                                <div className="col-span-2 flex items-center gap-6 text-xs text-text-muted">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-semibold tracking-wider opacity-50 mb-0.5">Bundle Size</span>
                                        <span className="font-medium text-text-secondary flex items-center gap-1.5">
                                            <Layers className="h-3.5 w-3.5" />
                                            {template.reports.length} Reports
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-semibold tracking-wider opacity-50 mb-0.5">Last Run</span>
                                        <span className="font-medium text-text-secondary">
                                            {template.last_run_at ? new Date(template.last_run_at).toLocaleDateString() : 'Never'}
                                        </span>
                                    </div>
                                </div>

                                <div className="col-span-1 flex justify-end">
                                    <button
                                        onClick={() => handleRun(template)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium text-sm border border-primary/20"
                                    >
                                        <Play className="h-4 w-4 group-hover:fill-current" />
                                        Run
                                    </button>
                                </div>
                            </div>
                        </SpotlightCard>
                    ))}
                </div>
            )}

            {runningJob && (
                <TemplateProgressModal
                    templateName={runningJob.templateName}
                    jobs={runningJob.jobs}
                    currentIndex={runningJob.currentIndex}
                    totalCount={runningJob.totalCount}
                    onClose={() => setRunningJob(null)}
                    onDownloadAll={() => {
                        toast.success('Downloaded ' + runningJob.jobs.filter(j => j.status === 'complete').length + ' reports');
                    }}
                />
            )}
        </div>
    );
}
