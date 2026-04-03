import { useState, useCallback } from 'react';
import { CloudRain, Plus, RefreshCw } from 'lucide-react';
import { useRainEvents } from '@/hooks/useRainEvents';
import { useWeatherStations } from '@/hooks/useWeatherStations';
import { usePermissions } from '@/hooks/usePermissions';
import { AlertInbox } from '@/components/weather/AlertInbox';
import { ActivateSamplingDialog } from '@/components/weather/ActivateSamplingDialog';
import { DismissAlertDialog } from '@/components/weather/DismissAlertDialog';
import { ManualDeclarationDialog } from '@/components/weather/ManualDeclarationDialog';
import type { PrecipitationEvent, PrecipitationEventStatus } from '@/types/weather';

// ---------------------------------------------------------------------------
// Role permission sets
// ---------------------------------------------------------------------------

const DECLARE_ROLES = ['wv_supervisor', 'environmental_manager', 'site_manager', 'admin'];
const DISMISS_ROLES = ['wv_supervisor', 'environmental_manager', 'admin'];
const ACTIVATE_ROLES = ['wv_supervisor', 'environmental_manager', 'site_manager', 'executive', 'admin', 'coo'];

// ---------------------------------------------------------------------------
// Rain Event Alerts Page
// ---------------------------------------------------------------------------

export function RainEventAlertsPage() {
  const { getEffectiveRole } = usePermissions();
  const { events, loading, activateEvent, dismissEvent, declareManualEvent, refetch } = useRainEvents();
  const { stations } = useWeatherStations();

  const role = getEffectiveRole();
  const canDeclare = DECLARE_ROLES.includes(role);
  const canDismiss = DISMISS_ROLES.includes(role);
  const canActivate = ACTIVATE_ROLES.includes(role);

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [statusFilter, setStatusFilter] = useState<PrecipitationEventStatus | 'all'>('all');
  const [selectedEvent, setSelectedEvent] = useState<PrecipitationEvent | null>(null);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [showDismissDialog, setShowDismissDialog] = useState(false);
  const [showDeclareDialog, setShowDeclareDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  const handleActivate = useCallback(
    (event: PrecipitationEvent) => {
      if (!canActivate) return;
      setSelectedEvent(event);
      setShowActivateDialog(true);
    },
    [canActivate],
  );

  const handleDismiss = useCallback(
    (event: PrecipitationEvent) => {
      if (!canDismiss) return;
      setSelectedEvent(event);
      setShowDismissDialog(true);
    },
    [canDismiss],
  );

  const handleSelect = useCallback((event: PrecipitationEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg bg-gradient-to-br from-teal-600 to-teal-500 p-2.5">
            <CloudRain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Rain Event Alerts</h1>
            <p className="text-sm text-text-muted">
              Precipitation event monitoring, activation, and dismissal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canDeclare && (
            <button
              onClick={() => setShowDeclareDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              <Plus className="h-4 w-4" />
              Declare Event
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.04] disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Inbox */}
      <AlertInbox
        events={events}
        loading={loading}
        onActivate={handleActivate}
        onDismiss={handleDismiss}
        onSelect={handleSelect}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Empty state fallback when not loading and no events */}
      {!loading && events.length === 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center backdrop-blur-xl">
          <CloudRain className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <h3 className="mb-1 text-base font-medium text-text-secondary">No Rain Events Recorded</h3>
          <p className="text-sm text-text-muted">
            Precipitation events will appear here when weather thresholds are exceeded or events are manually declared.
          </p>
        </div>
      )}

      {/* Activate Sampling Dialog */}
      {selectedEvent && showActivateDialog && (
        <ActivateSamplingDialog
          event={selectedEvent}
          isOpen={showActivateDialog}
          onClose={() => {
            setShowActivateDialog(false);
            setSelectedEvent(null);
          }}
          onActivate={async (eventId, outfalls) => {
            const outfallIds = outfalls.map((o) => o.outfall_id);
            await activateEvent(eventId, outfallIds);
          }}
        />
      )}

      {/* Dismiss Alert Dialog */}
      {selectedEvent && showDismissDialog && (
        <DismissAlertDialog
          eventId={selectedEvent.id}
          rainfallInches={selectedEvent.rainfall_inches}
          stationName={
            stations.find((s) => s.id === selectedEvent.weather_station_id)?.station_name ?? 'Unknown'
          }
          isOpen={showDismissDialog}
          onClose={() => {
            setShowDismissDialog(false);
            setSelectedEvent(null);
          }}
          onDismiss={async (eventId, reasonCode, justification) => {
            await dismissEvent(eventId, reasonCode, justification);
          }}
        />
      )}

      {/* Manual Declaration Dialog */}
      <ManualDeclarationDialog
        isOpen={showDeclareDialog}
        onClose={() => setShowDeclareDialog(false)}
        onDeclare={async (data) => {
          await declareManualEvent({
            weather_station_id: data.weatherStationId,
            event_date: new Date().toISOString().split('T')[0] as string,
            rainfall_inches: data.rainfallInches,
            manual_trigger_reason_code: data.reasonCode,
            manual_trigger_justification: data.justification,
          });
        }}
        stations={stations.map((s) => ({ id: s.id, station_name: s.station_name }))}
      />
    </div>
  );
}

export default RainEventAlertsPage;
