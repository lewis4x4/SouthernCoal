import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase, getFreshToken } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRoadmapTasks } from '@/hooks/useRoadmapTasks';
import {
  useHandoffStore,
  calculatePriorityScore,
  assignTier,
} from '@/stores/handoff';
import type {
  HandoffInput,
  HandoffExtractionResult,
  ExtractedTaskUpdate,
  PriorityTask,
  WhatsNextQueue,
  HandoffEvidence,
  AIExtractionResult,
} from '@/types/handoff';
import type { RoadmapTask, RoadmapStatus } from '@/types/roadmap';

// ---------------------------------------------------------------------------
// AI Extraction Prompt (for future Claude API integration)
// ---------------------------------------------------------------------------
// const EXTRACTION_PROMPT = `...` - Defined but unused for MVP pattern matching

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------
export function useHandoffProcessing() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const { tasks, updateStatus, refresh } = useRoadmapTasks();
  const {
    status,
    extractionResult,
    setStatus,
    setError,
    setExtractionResult,
    setWhatsNextQueue,
    addResolved,
    addToHistory,
  } = useHandoffStore();

  const [isUploading, setIsUploading] = useState(false);

  /**
   * Upload a file attachment to the handoff-attachments bucket
   * Uses org-scoped path: {org_id}/{YYYY-MM-DD}/{timestamp}_{filename}
   */
  const uploadAttachment = useCallback(
    async (file: File): Promise<string> => {
      if (!user) {
        throw new Error('Must be logged in to upload');
      }

      if (!profile?.organization_id) {
        throw new Error('User must belong to an organization to upload');
      }

      setIsUploading(true);

      try {
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `${profile.organization_id}/${dateStr}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from('handoff-attachments')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        log('handoff_attachment_uploaded', {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: fileName,
        });

        return fileName;
      } finally {
        setIsUploading(false);
      }
    },
    [user, profile, log]
  );

  /**
   * Process handoff with AI when file attached
   */
  const processWithAI = useCallback(
    async (input: HandoffInput): Promise<AIExtractionResult> => {
      const token = await getFreshToken();

      const { data, error } = await supabase.functions.invoke('process-handoff', {
        body: {
          handoff_input_id: input.id,
          attachment_path: input.attachment_path,
          raw_content: input.raw_content,
          file_mime_type: input.file_mime_type,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        throw new Error(`AI processing failed: ${error.message}`);
      }

      return data as AIExtractionResult;
    },
    []
  );

  /**
   * Process raw input through AI extraction
   */
  const processHandoff = useCallback(
    async (input: HandoffInput) => {
      setStatus('extracting');
      setError(null);

      try {
        let result: HandoffExtractionResult;

        // Use AI processing for file attachments
        if (input.attachment_path) {
          const aiResult = await processWithAI(input);

          if (!aiResult.success) {
            throw new Error(aiResult.error || 'AI processing failed');
          }

          // Convert AI result to HandoffExtractionResult format
          result = {
            input_id: input.id,
            task_updates: aiResult.task_matches.map((match) => ({
              task_id: match.task_number,
              db_id: match.task_id,
              new_status: (match.proposed_status as RoadmapStatus) ?? 'in_progress',
              extracted_answer: match.matched_text,
              details: match.proposed_notes,
              confidence: match.match_confidence >= 0.8 ? 'high' : match.match_confidence >= 0.5 ? 'medium' : 'low',
              extraction_notes: match.reasoning,
            })),
            new_questions: [],
            resolved_questions: [],
            still_outstanding: [],
            summary: `AI extracted ${aiResult.task_matches.length} task match(es) from ${input.file_name ?? 'file'}`,
            raw_ai_response: aiResult.extracted_text,
            processed_at: new Date().toISOString(),
          };

          toast.success(`AI found ${aiResult.task_matches.length} task match(es)`, {
            description: `Processed in ${aiResult.processing_time_ms}ms`,
          });
        } else {
          // For text-only input, use pattern matching
          result = await extractTaskUpdates(input, tasks);
          toast.success(`Extracted ${result.task_updates.length} task update(s)`);
        }

        setExtractionResult(result);
        addToHistory(input);
        setStatus('previewing');

        log('handoff_processed', {
          input_id: input.id,
          source_type: input.source_type,
          source_from: input.source_from,
          task_updates_count: result.task_updates.length,
          has_attachment: !!input.attachment_path,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extraction failed';
        setError(message);
        setStatus('error');
        toast.error(message);
      }
    },
    [tasks, setStatus, setError, setExtractionResult, addToHistory, log, processWithAI]
  );

  /**
   * Apply extracted updates to the database
   */
  const applyUpdates = useCallback(
    async (
      updates: ExtractedTaskUpdate[],
      input: HandoffInput,
      selectedIndices?: number[]
    ) => {
      if (!user) {
        toast.error('Must be logged in');
        return;
      }

      setStatus('applying');

      const toApply = selectedIndices
        ? updates.filter((_, i) => selectedIndices.includes(i))
        : updates;

      let successCount = 0;
      let failCount = 0;

      for (const update of toApply) {
        const task = tasks.find((t) => t.task_id === update.task_id);
        if (!task) {
          failCount++;
          continue;
        }

        try {
          // Check for conflict (optimistic locking)
          const conflict = await checkConflict(task.id, task.updated_at);
          if (conflict) {
            toast.warning(`Task ${update.task_id} was modified by another user`);
            failCount++;
            continue;
          }

          // Build evidence metadata
          const evidence: HandoffEvidence = {
            handoff_input_id: input.id,
            source_type: input.source_type,
            source_date: input.source_date ?? new Date().toISOString(),
            source_from: input.source_from ?? 'Unknown',
            source_reference: input.source_reference ?? 'Direct paste',
            extracted_at: new Date().toISOString(),
          };

          // Update the task
          await updateStatus(task.task_id, task.id, update.new_status, task.status);

          // Update notes if we have details
          if (update.extracted_answer || update.details) {
            const noteContent = [
              update.extracted_answer,
              update.details,
              `---`,
              `Source: ${evidence.source_reference} (${evidence.source_from}, ${evidence.source_date})`,
            ]
              .filter(Boolean)
              .join('\n\n');

            await supabase
              .from('roadmap_tasks')
              .update({
                notes: task.notes
                  ? `${task.notes}\n\n${noteContent}`
                  : noteContent,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);
          }

          // Log to audit trail with full evidence
          log(
            'handoff_applied',
            {
              handoff_id: input.id,
              task_id: update.task_id,
              extracted_answer: update.extracted_answer,
              evidence,
              unblocks: update.unblocks,
              new_questions: update.new_questions,
              confidence: update.confidence,
            },
            {
              module: 'handoff',
              tableName: 'roadmap_tasks',
              recordId: task.id,
              oldValues: { status: task.status },
              newValues: { status: update.new_status },
            }
          );

          // Track as resolved
          if (update.new_status === 'complete') {
            addResolved({
              task_id: update.task_id,
              task_description: task.task_description,
              resolved_at: new Date().toISOString(),
              source_type: input.source_type,
              source_from: input.source_from ?? 'Unknown',
              source_reference: input.source_reference ?? '',
              answer: update.extracted_answer,
            });
          }

          successCount++;
        } catch (err) {
          console.error(`[handoff] Failed to apply update for ${update.task_id}:`, err);
          failCount++;
        }
      }

      // Refresh tasks and recalculate priority queue
      await refresh();
      await recalculatePriorityQueue(tasks);

      setStatus('complete');

      if (failCount > 0) {
        toast.warning(`Applied ${successCount} update(s), ${failCount} failed`);
      } else {
        toast.success(`Applied ${successCount} update(s)`);
      }

      log('handoff_bulk_applied', {
        input_id: input.id,
        success_count: successCount,
        fail_count: failCount,
        task_ids: toApply.map((u) => u.task_id),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalculatePriorityQueue called with fresh tasks
    [user, tasks, updateStatus, refresh, setStatus, log, addResolved]
  );

  /**
   * Recalculate the priority queue based on current task state
   */
  const recalculatePriorityQueue = useCallback(
    async (currentTasks?: RoadmapTask[]) => {
      const tasksToUse = currentTasks ?? tasks;

      // Build dependency graph
      const dependencyMap = buildDependencyGraph(tasksToUse);

      // Calculate priority for each incomplete task
      const priorityTasks: PriorityTask[] = tasksToUse
        .filter((t) => t.status !== 'complete' && t.status !== 'na')
        .map((task) => {
          const blocks = dependencyMap.get(task.task_id) ?? [];
          const downstreamImpact = blocks.length;
          const isBlockerRemoval = blocks.some((bid) => {
            const blocked = tasksToUse.find((t) => t.task_id === bid);
            return blocked?.status === 'blocked';
          });
          const hasExternalDep =
            task.owner_type === 'tom' || task.owner_type === 'scc_mgmt';

          const score = calculatePriorityScore(
            downstreamImpact,
            isBlockerRemoval,
            task.phase,
            hasExternalDep
          );

          const tier = assignTier(task.owner_type, hasExternalDep, task.status);

          return {
            id: task.id,
            db_id: task.id,
            task_id: task.task_id,
            task_description: task.task_description,
            phase: task.phase,
            section: task.section,
            owner_type: task.owner_type,
            status: task.status,
            score: {
              total: score.total,
              formula: score.formula,
              factors: {
                downstream_impact: downstreamImpact,
                is_blocker_removal: isBlockerRemoval,
                phase_weight: 6 - task.phase,
                has_external_dependency: hasExternalDep,
              },
            },
            tier,
            depends_on: task.depends_on ?? [],
            blocks,
            evidence_paths: task.evidence_paths ?? [],
          };
        })
        .sort((a, b) => b.score.total - a.score.total);

      // Split into tiers
      const queue: WhatsNextQueue = {
        tier_1_critical: priorityTasks.filter((t) => t.tier === 1),
        tier_2_actionable: priorityTasks.filter((t) => t.tier === 2),
        tier_3_parallel: priorityTasks.filter((t) => t.tier === 3),
        generated_at: new Date().toISOString(),
      };

      setWhatsNextQueue(queue);

      log('priority_queue_generated', {
        tier_1_count: queue.tier_1_critical.length,
        tier_2_count: queue.tier_2_actionable.length,
        tier_3_count: queue.tier_3_parallel.length,
        top_priority: queue.tier_2_actionable[0]?.task_id ?? queue.tier_1_critical[0]?.task_id,
      });

      return queue;
    },
    [tasks, setWhatsNextQueue, log]
  );

  return {
    status,
    extractionResult,
    processHandoff,
    applyUpdates,
    recalculatePriorityQueue,
    uploadAttachment,
    isUploading,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Extract task updates from raw input
 * For MVP: Pattern matching. Production: Claude API call.
 */
async function extractTaskUpdates(
  input: HandoffInput,
  tasks: RoadmapTask[]
): Promise<HandoffExtractionResult> {
  const content = input.raw_content.toLowerCase();
  const updates: ExtractedTaskUpdate[] = [];
  const newQuestions: string[] = [];

  // Pattern-based extraction for MVP
  // Look for task ID patterns like "1.22", "2.03", etc.
  const taskIdPattern = /\b(\d+\.\d+(?:\.\d+)?)\b/g;
  const matches = content.match(taskIdPattern) ?? [];

  for (const taskId of matches) {
    const task = tasks.find((t) => t.task_id === taskId);
    if (!task) continue;

    // Determine status based on context
    let newStatus: RoadmapStatus = 'in_progress';
    if (content.includes('complete') || content.includes('done') || content.includes('finished')) {
      newStatus = 'complete';
    } else if (content.includes('blocked') || content.includes('waiting')) {
      newStatus = 'blocked';
    }

    // Extract surrounding context as the answer
    const contextStart = Math.max(0, content.indexOf(taskId) - 100);
    const contextEnd = Math.min(content.length, content.indexOf(taskId) + 200);
    const contextSnippet = input.raw_content.slice(contextStart, contextEnd);

    updates.push({
      task_id: taskId,
      db_id: task.id,
      old_status: task.status,
      new_status: newStatus,
      extracted_answer: contextSnippet.trim(),
      confidence: 'medium',
      extraction_notes: 'Extracted via pattern matching',
    });
  }

  // Look for question patterns
  const questionPattern = /\?[^\n]*/g;
  const questions = input.raw_content.match(questionPattern) ?? [];
  for (const q of questions.slice(0, 5)) {
    newQuestions.push(q.trim());
  }

  return {
    input_id: input.id,
    task_updates: updates,
    new_questions: newQuestions.map((q) => ({ question: q, priority: 'medium' as const })),
    resolved_questions: [],
    still_outstanding: [],
    summary: `Extracted ${updates.length} task update(s) from ${input.source_type}`,
    processed_at: new Date().toISOString(),
  };
}

/**
 * Check for concurrent modification
 */
async function checkConflict(
  taskId: string,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('roadmap_tasks')
    .select('updated_at')
    .eq('id', taskId)
    .single();

  if (!data) return true; // Task deleted

  return data.updated_at !== expectedUpdatedAt;
}

/**
 * Build a map of task_id -> [tasks that depend on this task]
 */
function buildDependencyGraph(
  tasks: RoadmapTask[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  // Initialize all tasks with empty arrays
  for (const task of tasks) {
    map.set(task.task_id, []);
  }

  // For each task, add it to the "blocks" list of its dependencies
  for (const task of tasks) {
    if (!task.depends_on) continue;

    for (const depId of task.depends_on) {
      const existing = map.get(depId) ?? [];
      if (!existing.includes(task.task_id)) {
        existing.push(task.task_id);
        map.set(depId, existing);
      }
    }
  }

  return map;
}
