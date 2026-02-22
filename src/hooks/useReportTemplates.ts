import { useState, useCallback, useEffect } from 'react';
import { supabase, getFreshToken } from '@/lib/supabase';
import { useAuditLog } from './useAuditLog';
import { toast } from 'sonner';

export interface TemplateReportEntry {
    report_key: string;
    config: {
        date_from?: string;
        date_to?: string;
        states?: string[];
        org_ids?: string[];
    };
    format: 'csv' | 'pdf' | 'both';
    delivery: {
        download?: boolean;
        email?: boolean;
        recipients?: string[];
    };
}

export interface ReportTemplate {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    created_by: string;
    is_shared: boolean;
    reports: TemplateReportEntry[];
    last_run_at: string | null;
    run_count: number;
    created_at: string;
    updated_at: string;
}

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

export function useReportTemplates() {
    const [templates, setTemplates] = useState<ReportTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const { log } = useAuditLog();

    const fetchTemplates = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('report_templates')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTemplates(data || []);
        } catch (err: unknown) {
            console.error('Failed to fetch report templates:', err);
            toast.error('Failed to load templates');
        } finally {
            setLoading(false);
        }
    }, []);

    const createTemplate = useCallback(async (
        name: string,
        description: string,
        reports: TemplateReportEntry[],
        isShared: boolean,
    ) => {
        try {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Not authenticated');

            const { data: profile } = await supabase
                .from('user_profiles')
                .select('organization_id')
                .eq('id', user.user.id)
                .single();

            if (!profile) throw new Error('User profile not found');

            const { data, error } = await supabase
                .from('report_templates')
                .insert({
                    organization_id: profile.organization_id,
                    name,
                    description,
                    reports,
                    is_shared: isShared,
                    created_by: user.user.id,
                })
                .select()
                .single();

            if (error) throw error;

            setTemplates((prev) => [data, ...prev]);

            log('report_template_created', {
                entity: 'report_template',
                entityId: data.id,
                details: { name, reportCount: reports.length },
            });

            return data;
        } catch (err: unknown) {
            console.error('Failed to create template:', err);
            toast.error(getErrorMessage(err) || 'Failed to create template');
        }
    }, [log]);

    const updateTemplate = useCallback(async (
        id: string,
        updates: Partial<{ name: string; description: string; reports: TemplateReportEntry[]; is_shared: boolean }>,
    ) => {
        try {
            const { data, error } = await supabase
                .from('report_templates')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            setTemplates((prev) => prev.map(t => t.id === id ? data : t));

            log('report_template_updated', {
                entity: 'report_template',
                entityId: id,
                details: updates,
            });

            return data;
        } catch (err: unknown) {
            console.error('Failed to update template:', err);
            toast.error(getErrorMessage(err) || 'Failed to update template');
        }
    }, [log]);

    const deleteTemplate = useCallback(async (id: string, name: string) => {
        try {
            const { error } = await supabase
                .from('report_templates')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setTemplates((prev) => prev.filter(t => t.id !== id));

            log('report_template_deleted', {
                entity: 'report_template',
                entityId: id,
                details: { name },
            });
        } catch (err: unknown) {
            console.error('Failed to delete template:', err);
            toast.error(getErrorMessage(err) || 'Failed to delete template');
        }
    }, [log]);

    const runTemplate = useCallback(async (template: ReportTemplate) => {
        try {
            const jobIds: { report_key: string; job_id: string }[] = [];

            // Execute each report sequentially — fresh token per request per project rules
            for (const entry of template.reports) {
                const token = await getFreshToken();
                const response = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-report`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            report_key: entry.report_key,
                            format: entry.format,
                            config: entry.config,
                            delivery: entry.delivery,
                        }),
                    },
                );

                if (!response.ok) {
                    const errBody = await response.json().catch(() => ({}));
                    throw new Error(`Failed to start report ${entry.report_key}: ${(errBody as Record<string, string>).error || response.statusText}`);
                }

                const data = await response.json();
                jobIds.push({ report_key: entry.report_key, job_id: data.job_id });
            }

            // Atomic increment via Postgres RPC — prevents race condition
            await supabase.rpc('increment_template_run_count', {
                template_id: template.id,
            });

            // Optimistically update local state
            setTemplates((prev) => prev.map(t =>
                t.id === template.id
                    ? { ...t, run_count: t.run_count + 1, last_run_at: new Date().toISOString() }
                    : t
            ));

            log('report_template_run', {
                entity: 'report_template',
                entityId: template.id,
                details: { name: template.name, jobCount: jobIds.length },
            });

            return jobIds;
        } catch (err: unknown) {
            console.error('Failed to run template:', err);
            toast.error(getErrorMessage(err) || 'Failed to run template');
        }
    }, [log]);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    return {
        templates,
        loading,
        fetchTemplates,
        createTemplate,
        updateTemplate,
        deleteTemplate,
        runTemplate,
    };
}
