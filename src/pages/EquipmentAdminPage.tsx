import { useState } from 'react';
import { Wrench, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useEquipment } from '@/hooks/useEquipment';
import {
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_STATUS_COLORS,
} from '@/types/equipment';
import type { EquipmentType } from '@/types/equipment';

const EQUIPMENT_TYPES: EquipmentType[] = ['tablet', 'meter', 'gps', 'cooler', 'vehicle', 'probe', 'sampler', 'other'];

export function EquipmentAdminPage() {
  const { equipment, calibrationsDue, loading, addEquipment } = useEquipment();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<EquipmentType>('meter');
  const [newSerial, setNewSerial] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newManufacturer, setNewManufacturer] = useState('');
  const [newRequiresCal, setNewRequiresCal] = useState(false);
  const [newCalInterval, setNewCalInterval] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'calibration'>('inventory');

  async function handleAdd() {
    if (!newName.trim()) return;
    setSubmitting(true);
    const result = await addEquipment({
      name: newName.trim(),
      equipment_type: newType,
      serial_number: newSerial.trim() || undefined,
      model: newModel.trim() || undefined,
      manufacturer: newManufacturer.trim() || undefined,
      requires_calibration: newRequiresCal,
      calibration_interval_days: newCalInterval ? parseInt(newCalInterval, 10) : undefined,
    });
    setSubmitting(false);
    if (!result.error) {
      setNewName('');
      setNewSerial('');
      setNewModel('');
      setNewManufacturer('');
      setNewRequiresCal(false);
      setNewCalInterval('');
      setShowAddForm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-orange-500/10 p-2.5">
          <Wrench className="h-6 w-6 text-orange-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Equipment Management
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Track equipment inventory, assignments, calibration schedules, and maintenance.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors"
        >
          <Plus size={16} />
          Add Equipment
        </button>
      </div>

      {/* Calibration due alert */}
      {calibrationsDue.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <span className="text-sm text-text-secondary">
            <strong className="text-amber-300">{calibrationsDue.length}</strong> equipment item{calibrationsDue.length !== 1 ? 's' : ''} due for calibration within 14 days
          </span>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <SpotlightCard spotlightColor="rgba(249, 115, 22, 0.08)" className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">New Equipment</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Equipment name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as EquipmentType)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30"
            >
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>{EQUIPMENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Serial number"
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
            />
            <input
              type="text"
              placeholder="Model"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
            />
            <input
              type="text"
              placeholder="Manufacturer"
              value={newManufacturer}
              onChange={(e) => setNewManufacturer(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={newRequiresCal}
                onChange={(e) => setNewRequiresCal(e.target.checked)}
                className="rounded border-white/20"
              />
              Requires calibration
            </label>
            {newRequiresCal && (
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                Every
                <input
                  type="number"
                  placeholder="days"
                  value={newCalInterval}
                  onChange={(e) => setNewCalInterval(e.target.value)}
                  className="w-20 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                />
                days
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || submitting}
              className="rounded-lg bg-orange-500/15 px-4 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/25 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </SpotlightCard>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-0">
        {(['inventory', 'calibration'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors border-b-2',
              activeTab === tab
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {tab === 'inventory' ? 'Inventory' : 'Calibration Due'}
            {tab === 'calibration' && calibrationsDue.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                {calibrationsDue.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Inventory tab */}
      {activeTab === 'inventory' && (
        <div className="space-y-2">
          {equipment.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center text-sm text-text-muted">
              No equipment registered yet.
            </div>
          ) : (
            equipment.map((item) => {
              const colors = EQUIPMENT_STATUS_COLORS[item.status];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{item.name}</span>
                      <span className="rounded-full bg-white/[0.05] border border-white/[0.1] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-text-muted">
                        {EQUIPMENT_TYPE_LABELS[item.equipment_type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-muted">
                      {item.serial_number && <span>S/N: {item.serial_number}</span>}
                      {item.model && <span>{item.model}</span>}
                      {item.requires_calibration && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle size={10} /> Cal. required
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border',
                    colors.bg, colors.border, colors.text,
                  )}>
                    {item.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Calibration tab */}
      {activeTab === 'calibration' && (
        <div className="space-y-2">
          {calibrationsDue.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] px-6 py-8 text-sm text-emerald-300">
              <CheckCircle2 size={18} />
              All equipment calibrations are current.
            </div>
          ) : (
            calibrationsDue.map((item) => {
              const isOverdue = item.days_until_due !== null && item.days_until_due < 0;
              return (
                <div
                  key={item.equipment_id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3',
                    isOverdue
                      ? 'border-red-500/20 bg-red-500/[0.03]'
                      : 'border-amber-500/20 bg-amber-500/[0.03]',
                  )}
                >
                  <AlertTriangle
                    size={16}
                    className={isOverdue ? 'text-red-400' : 'text-amber-400'}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-text-primary">
                      {item.equipment_name}
                    </span>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-muted">
                      <span>{EQUIPMENT_TYPE_LABELS[item.equipment_type as keyof typeof EQUIPMENT_TYPE_LABELS] ?? item.equipment_type}</span>
                      {item.serial_number && <span>S/N: {item.serial_number}</span>}
                      {item.assigned_to_name && <span>Assigned: {item.assigned_to_name}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      'text-sm font-bold',
                      isOverdue ? 'text-red-400' : 'text-amber-400',
                    )}>
                      {item.days_until_due !== null
                        ? isOverdue
                          ? `${Math.abs(item.days_until_due)}d overdue`
                          : `${item.days_until_due}d`
                        : 'Never calibrated'}
                    </span>
                    {item.next_calibration_due && (
                      <p className="text-[10px] text-text-muted">
                        Due {new Date(item.next_calibration_due).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default EquipmentAdminPage;
