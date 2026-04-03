export type EquipmentType = 'tablet' | 'meter' | 'gps' | 'cooler' | 'vehicle' | 'probe' | 'sampler' | 'other';

export type EquipmentStatus = 'available' | 'assigned' | 'maintenance' | 'retired' | 'lost';

export type CalibrationResult = 'pass' | 'fail' | 'adjusted';

export type MaintenanceType = 'preventive' | 'corrective' | 'emergency' | 'inspection';

export type EquipmentCondition = 'good' | 'fair' | 'needs_repair' | 'damaged';

export interface EquipmentCatalogItem {
  id: string;
  organization_id: string;
  name: string;
  equipment_type: EquipmentType;
  serial_number: string | null;
  model: string | null;
  manufacturer: string | null;
  purchase_date: string | null;
  warranty_expires: string | null;
  requires_calibration: boolean;
  calibration_interval_days: number | null;
  status: EquipmentStatus;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentAssignment {
  id: string;
  equipment_id: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  returned_at: string | null;
  condition_on_assign: string;
  condition_on_return: string | null;
  notes: string | null;
}

export interface CalibrationLog {
  id: string;
  equipment_id: string;
  calibrated_by: string;
  calibrated_at: string;
  next_calibration_due: string | null;
  result: CalibrationResult;
  standard_used: string | null;
  readings_before: Record<string, unknown> | null;
  readings_after: Record<string, unknown> | null;
  certificate_path: string | null;
  notes: string | null;
  created_at: string;
}

export interface MaintenanceLog {
  id: string;
  equipment_id: string;
  performed_by: string | null;
  maintenance_type: MaintenanceType;
  description: string;
  parts_replaced: string | null;
  cost_estimate: number | null;
  performed_at: string;
  next_maintenance_due: string | null;
  created_at: string;
}

export interface DailyReadinessChecklist {
  id: string;
  organization_id: string;
  user_id: string;
  checklist_date: string;
  tablet_charged: boolean | null;
  gps_functional: boolean | null;
  meter_calibrated: boolean | null;
  cooler_prepared: boolean | null;
  bottles_sufficient: boolean | null;
  vehicle_inspected: boolean | null;
  ppe_available: boolean | null;
  all_passed: boolean;
  notes: string | null;
  completed_at: string;
}

export interface BottleKitInventory {
  id: string;
  organization_id: string;
  kit_name: string;
  parameter_group: string | null;
  bottle_count: number;
  bottles_available: number;
  preservative: string | null;
  container_type: string;
  volume_ml: number | null;
  last_restocked_at: string | null;
  restock_threshold: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalibrationDueItem {
  equipment_id: string;
  equipment_name: string;
  equipment_type: string;
  serial_number: string | null;
  last_calibrated_at: string | null;
  next_calibration_due: string | null;
  days_until_due: number | null;
  assigned_to_name: string | null;
}

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  tablet: 'Tablet',
  meter: 'Meter',
  gps: 'GPS Unit',
  cooler: 'Cooler',
  vehicle: 'Vehicle',
  probe: 'Probe',
  sampler: 'Sampler',
  other: 'Other',
};

export const EQUIPMENT_STATUS_COLORS: Record<EquipmentStatus, { bg: string; border: string; text: string }> = {
  available: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  assigned: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
  maintenance: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  retired: { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400' },
  lost: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
};
