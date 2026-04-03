import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Notification } from '@/types/notifications';

export function useNotifications() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[notifications] Failed to fetch:', error.message);
      setLoading(false);
      return;
    }

    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription scoped to user
  useEffect(() => {
    if (!user?.id || !profile?.organization_id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.organization_id]);

  const unreadCount = notifications.filter(
    (n) => !n.in_app_read_at && !n.dismissed_at,
  ).length;

  const markRead = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ in_app_read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, in_app_read_at: new Date().toISOString() }
            : n,
        ),
      );
    }
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .update({ in_app_read_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .is('in_app_read_at', null);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          in_app_read_at: n.in_app_read_at ?? new Date().toISOString(),
        })),
      );
    }
  }, [user?.id]);

  const dismiss = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (!error) {
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    dismiss,
    refresh: fetchNotifications,
  };
}
