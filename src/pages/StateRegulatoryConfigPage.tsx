import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Save,
  Shield,
  Phone,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { usePermissions } from '@/hooks/usePermissions';
import { useStateRegulatoryConfig } from '@/hooks/useStateRegulatoryConfig';
import {
  SCC_STATE_CODES,
  REGULATORY_CONTACT_TYPE_LABELS,
  type SccStateCode,
  type RegulatoryContactType,
  type StateRegulatoryConfigUpdate,
  type RegulatoryContactInput,
  type RegulatoryContact,
} from '@/types/stateRegulatory';

const BELOW_DETECTION_OPTIONS = [
  { value: 'zero', label: 'Report as zero' },
  { value: 'half_mdl', label: 'Half MDL' },
  { value: 'mdl', label: 'Full MDL' },
  { value: 'omit', label: 'Omit from calculation' },
];

function ContactForm({
  initial,
  stateId,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: RegulatoryContact;
  stateId: string;
  onSubmit: (input: RegulatoryContactInput) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<RegulatoryContactInput>({
    state_id: stateId,
    agency: initial?.agency ?? '',
    contact_type: initial?.contact_type ?? 'general',
    name: initial?.name ?? '',
    title: initial?.title ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    notes: initial?.notes ?? '',
  });

  useEffect(() => {
    setForm({
      state_id: stateId,
      agency: initial?.agency ?? '',
      contact_type: initial?.contact_type ?? 'general',
      name: initial?.name ?? '',
      title: initial?.title ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      address: initial?.address ?? '',
      notes: initial?.notes ?? '',
    });
  }, [initial, stateId]);

  const isValid = form.agency.trim().length > 0;

  return (
    <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.08)" className="p-5 space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">
        {initial ? 'Edit Contact' : 'New Contact'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Agency *"
          value={form.agency}
          onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
          className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-qo-accent/30"
        />
        <select
          value={form.contact_type}
          onChange={(e) =>
            setForm((f) => ({ ...f, contact_type: e.target.value as RegulatoryContactType }))
          }
          className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
        >
          {Object.entries(REGULATORY_CONTACT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Name"
          value={form.name ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-qo-accent/30"
        />
        <input
          type="text"
          placeholder="Title"
          value={form.title ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-qo-accent/30"
        />
        <input
          type="tel"
          placeholder="Phone"
          value={form.phone ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-qo-accent/30"
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-qo-accent/30"
        />
      </div>
      <textarea
        placeholder="Address"
        value={form.address ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        rows={2}
        className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-qo-accent/30"
      />
      <textarea
        placeholder="Notes"
        value={form.notes ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        rows={2}
        className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-qo-accent/30"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!isValid || submitting}
          onClick={() =>
            onSubmit({
              ...form,
              state_id: stateId,
              agency: form.agency.trim(),
              name: form.name?.trim() || null,
              title: form.title?.trim() || null,
              phone: form.phone?.trim() || null,
              email: form.email?.trim() || null,
              address: form.address?.trim() || null,
              notes: form.notes?.trim() || null,
            })
          }
          className="flex items-center gap-1.5 rounded-xl bg-qo-accent/15 px-4 py-2 text-sm font-medium text-qo-accent hover:bg-qo-accent/25 transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {initial ? 'Update' : 'Add'} Contact
        </button>
      </div>
    </SpotlightCard>
  );
}

function StateConfigPanel({
  stateCode,
  getConfigByStateCode,
  getContactsByStateId,
  updateConfig,
  createContact,
  updateContact,
  deleteContact,
}: {
  stateCode: SccStateCode;
  getConfigByStateCode: ReturnType<typeof useStateRegulatoryConfig>['getConfigByStateCode'];
  getContactsByStateId: ReturnType<typeof useStateRegulatoryConfig>['getContactsByStateId'];
  updateConfig: ReturnType<typeof useStateRegulatoryConfig>['updateConfig'];
  createContact: ReturnType<typeof useStateRegulatoryConfig>['createContact'];
  updateContact: ReturnType<typeof useStateRegulatoryConfig>['updateContact'];
  deleteContact: ReturnType<typeof useStateRegulatoryConfig>['deleteContact'];
}) {

  const config = getConfigByStateCode(stateCode);
  const stateId = config?.state_id ?? config?.states?.id ?? '';
  const stateContacts = useMemo(
    () => (stateId ? getContactsByStateId(stateId) : []),
    [getContactsByStateId, stateId],
  );

  const [form, setForm] = useState<StateRegulatoryConfigUpdate>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<RegulatoryContact | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);

  useEffect(() => {
    if (!config) return;
    setForm({
      issuing_agency_name: config.issuing_agency_name,
      issuing_agency_division: config.issuing_agency_division,
      dmr_submission_system: config.dmr_submission_system,
      dmr_submission_url: config.dmr_submission_url,
      dmr_due_day_of_month: config.dmr_due_day_of_month,
      dmr_due_months_after: config.dmr_due_months_after,
      below_detection_calc_rule: config.below_detection_calc_rule,
      below_detection_dmr_rule: config.below_detection_dmr_rule,
      oral_notification_hours: config.oral_notification_hours,
      written_notification_days: config.written_notification_days,
      lab_certification_required: config.lab_certification_required,
      notes: config.notes,
    });
  }, [config]);

  if (!config) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] px-4 py-6 text-sm text-text-secondary">
        No regulatory config found for {stateCode}. Seed data may be missing.
      </div>
    );
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    await updateConfig(config!.id, form, stateCode);
    setSavingConfig(false);
  }

  async function handleCreateContact(input: RegulatoryContactInput) {
    setContactSubmitting(true);
    const result = await createContact(input);
    setContactSubmitting(false);
    if (!result.error) {
      setShowContactForm(false);
    }
  }

  async function handleUpdateContact(input: RegulatoryContactInput) {
    if (!editingContact) return;
    setContactSubmitting(true);
    const result = await updateContact(editingContact.id, input);
    setContactSubmitting(false);
    if (!result.error) {
      setEditingContact(null);
    }
  }

  return (
    <div className="space-y-6">
      <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.08)" className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {config.states?.name ?? stateCode} — Agency & DMR Settings
          </h3>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="flex items-center gap-1.5 rounded-xl bg-qo-accent/15 px-4 py-2 text-sm font-medium text-qo-accent hover:bg-qo-accent/25 transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            Save Config
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Issuing Agency
            </label>
            <input
              type="text"
              value={form.issuing_agency_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, issuing_agency_name: e.target.value }))}
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Agency Division
            </label>
            <input
              type="text"
              value={form.issuing_agency_division ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, issuing_agency_division: e.target.value || null }))
              }
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              DMR Submission System
            </label>
            <input
              type="text"
              value={form.dmr_submission_system ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, dmr_submission_system: e.target.value }))}
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              DMR Portal URL
            </label>
            <input
              type="url"
              value={form.dmr_submission_url ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, dmr_submission_url: e.target.value || null }))
              }
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              DMR Due Day of Month
            </label>
            <input
              type="number"
              min={1}
              max={31}
              value={form.dmr_due_day_of_month ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  dmr_due_months_after: f.dmr_due_months_after ?? 1,
                  dmr_due_day_of_month: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Months After Reporting Period
            </label>
            <input
              type="number"
              min={0}
              max={3}
              value={form.dmr_due_months_after ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  dmr_due_months_after: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Below Detection — Calc Rule
            </label>
            <select
              value={form.below_detection_calc_rule ?? 'zero'}
              onChange={(e) => setForm((f) => ({ ...f, below_detection_calc_rule: e.target.value }))}
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            >
              {BELOW_DETECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Below Detection — DMR Rule
            </label>
            <select
              value={form.below_detection_dmr_rule ?? 'zero'}
              onChange={(e) => setForm((f) => ({ ...f, below_detection_dmr_rule: e.target.value }))}
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            >
              {BELOW_DETECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Oral Notification (hours)
            </label>
            <input
              type="number"
              min={0}
              value={form.oral_notification_hours ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  oral_notification_hours: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Written Notification (days)
            </label>
            <input
              type="number"
              min={0}
              value={form.written_notification_days ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  written_notification_days: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Lab Certification Required
            </label>
            <input
              type="text"
              value={form.lab_certification_required ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, lab_certification_required: e.target.value || null }))
              }
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-text-secondary">Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
              rows={3}
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary outline-none focus:border-qo-accent/30"
            />
          </div>
        </div>
      </SpotlightCard>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Regulatory Contacts ({stateContacts.length})
          </h3>
          {!showContactForm && !editingContact && (
            <button
              type="button"
              onClick={() => setShowContactForm(true)}
              className="flex items-center gap-1.5 rounded-xl bg-qo-accent/15 px-4 py-2 text-sm font-medium text-qo-accent hover:bg-qo-accent/25 transition-colors"
            >
              <Plus size={16} />
              Add Contact
            </button>
          )}
        </div>

        {showContactForm && (
          <ContactForm
            stateId={stateId}
            onSubmit={handleCreateContact}
            onCancel={() => setShowContactForm(false)}
            submitting={contactSubmitting}
          />
        )}

        {editingContact && (
          <ContactForm
            initial={editingContact}
            stateId={stateId}
            onSubmit={handleUpdateContact}
            onCancel={() => setEditingContact(null)}
            submitting={contactSubmitting}
          />
        )}

        {stateContacts.length === 0 && !showContactForm ? (
          <div className="rounded-xl border border-black/[0.06] bg-qo-nested px-4 py-8 text-center text-sm text-text-muted">
            No contacts for this state yet.
          </div>
        ) : (
          <div className="space-y-2">
            {stateContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-black/[0.06] bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {contact.name ?? 'Unnamed contact'}
                    </span>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-qo-sage-text">
                      {REGULATORY_CONTACT_TYPE_LABELS[contact.contact_type]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {contact.agency}
                    {contact.title ? ` · ${contact.title}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-secondary">
                    {contact.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={12} />
                        {contact.phone}
                      </span>
                    )}
                    {contact.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail size={12} />
                        {contact.email}
                      </span>
                    )}
                  </div>
                  {contact.notes && (
                    <p className="mt-2 text-xs text-text-muted">{contact.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowContactForm(false);
                      setEditingContact(contact);
                    }}
                    className="rounded-lg p-2 text-text-muted hover:bg-black/[0.04] hover:text-text-secondary transition-colors"
                    aria-label="Edit contact"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteContact(contact.id)}
                    className="rounded-lg p-2 text-text-muted hover:bg-red-500/10 hover:text-qo-risk transition-colors"
                    aria-label="Remove contact"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function StateRegulatoryConfigPage() {
  const { getEffectiveRole } = usePermissions();
  const {
    loading,
    getConfigByStateCode,
    getContactsByStateId,
    updateConfig,
    createContact,
    updateContact,
    deleteContact,
  } = useStateRegulatoryConfig();
  const [activeState, setActiveState] = useState<SccStateCode>('AL');

  const isAdmin = getEffectiveRole() === 'admin';

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3 text-qo-risk">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-medium">Admin access required.</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-4">
        <Link
          to="/admin"
          className="mt-1 rounded-lg p-1.5 text-text-muted hover:bg-black/[0.04] hover:text-text-secondary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="inline-flex rounded-xl bg-emerald-500/10 p-2.5">
          <MapPin className="h-6 w-6 text-qo-sage-text" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            State Regulatory Config
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Agency contacts, DMR system settings, and state-specific compliance rules.
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-qo-nested p-1 border border-black/[0.06]">
        {SCC_STATE_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setActiveState(code)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all',
              activeState === code
                ? 'bg-black/[0.06] text-text-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-qo-nested',
            )}
          >
            {code}
          </button>
        ))}
      </div>

      <StateConfigPanel
        stateCode={activeState}
        getConfigByStateCode={getConfigByStateCode}
        getContactsByStateId={getContactsByStateId}
        updateConfig={updateConfig}
        createContact={createContact}
        updateContact={updateContact}
        deleteContact={deleteContact}
      />
    </div>
  );
}

export default StateRegulatoryConfigPage;
