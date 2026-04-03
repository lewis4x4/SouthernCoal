import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { NotificationPreference, NotificationEventType } from '@/types/notifications';
import { EVENT_TYPE_LABELS } from '@/types/notifications';

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as NotificationEventType[];

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('[notification_prefs] Failed to fetch:', error.message);
      setLoading(false);
      return;
    }

    setPreferences((data ?? []) as NotificationPreference[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  /** Get preferences for a specific event type, returning defaults if none saved */
  const getPreference = useCallback(
    (eventType: NotificationEventType): NotificationPreference => {
      const existing = preferences.find((p) => p.event_type === eventType);
      if (existing) return existing;
      return {
        id: '',
        user_id: user?.id ?? '',
        event_type: eventType,
        in_app_enabled: true,
        email_enabled: false,
        sms_enabled: false,
      };
    },
    [preferences, user?.id],
  );

  const updatePreference = useCallback(
    async (
      eventType: NotificationEventType,
      channel: 'in_app_enabled' | 'email_enabled' | 'sms_enabled',
      enabled: boolean,
    ) => {
      if (!user?.id) return;

      const existing = preferences.find((p) => p.event_type === eventType);

      if (existing) {
        const { error } = await supabase
          .from('notification_preferences')
          .update({ [channel]: enabled, updated_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (error) {
          toast.error('Failed to update preference');
          return;
        }
      } else {
        const { error } = await supabase.from('notification_preferences').insert({
          user_id: user.id,
          event_type: eventType,
          in_app_enabled: channel === 'in_app_enabled' ? enabled : true,
          email_enabled: channel === 'email_enabled' ? enabled : false,
          sms_enabled: channel === 'sms_enabled' ? enabled : false,
        });

        if (error) {
          toast.error('Failed to save preference');
          return;
        }
      }

      fetchPreferences();
    },
    [user?.id, preferences, fetchPreferences],
  );

  return {
    preferences,
    loading,
    allEventTypes: ALL_EVENT_TYPES,
    getPreference,
    updatePreference,
  };
}
