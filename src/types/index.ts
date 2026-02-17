export type { UserProfile, RoleAssignment, Role, Permission } from './auth';
export type { QueueEntry } from './queue';
export type { StagedFile, ClassificationResult, UploadProgress } from './upload';
export type { MatrixCell, SummaryStats } from './matrix';

// Database table types (recent migrations)
export type {
  ParameterAlias,
  ParameterAliasWithName,
  ParameterAliasSource,
  OutfallAlias,
  OutfallAliasSource,
  OutfallMatchMethod,
  PermitLimitReviewStatus,
  ExtractionSource,
  PermitLimitReviewFields,
  FileCategoryKey,
} from './database';

// Obligations and compliance
export type { Obligation, ObligationStatus, PenaltyTier } from './obligations';

// Corrections
export type { DataCorrection } from './corrections';

// Roadmap
export type { RoadmapTask, RoadmapStatus } from './roadmap';

// Corrective actions
export type {
  CorrectiveAction,
  CAStatus,
  CAActivity,
  WorkflowStep,
} from './corrective-actions';

// Search
export type {
  DocumentChunk,
  DocumentSearchResponse,
  ComplianceSearchResponse,
} from './search';
