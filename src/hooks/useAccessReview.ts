import { useState, useCallback } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';

const REVIEW_DATE_KEY = 'scc_last_access_review';

interface ReviewItem {
  userId: string;
  userName: string;
  role: string;
  confirmed: boolean | null; // null = not reviewed yet
}

export function useAccessReview() {
  const { log } = useAuditLog();
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);

  const lastReviewDate = (() => {
    try {
      return localStorage.getItem(REVIEW_DATE_KEY);
    } catch {
      return null;
    }
  })();

  const daysSinceLastReview = lastReviewDate
    ? Math.floor((Date.now() - new Date(lastReviewDate).getTime()) / 86_400_000)
    : null;

  const isOverdue = daysSinceLastReview === null || daysSinceLastReview > 90;

  const startReview = useCallback((users: { id: string; name: string; role: string }[]) => {
    setReviewItems(users.map(u => ({
      userId: u.id,
      userName: u.name,
      role: u.role,
      confirmed: null,
    })));
    setIsReviewing(true);
  }, []);

  const setItemStatus = useCallback((userId: string, confirmed: boolean) => {
    setReviewItems(prev => prev.map(item =>
      item.userId === userId ? { ...item, confirmed } : item
    ));
  }, []);

  const completeReview = useCallback(() => {
    const reviewed = reviewItems.filter(i => i.confirmed !== null);
    const revoked = reviewItems.filter(i => i.confirmed === false);

    log('access_review_completed', {
      reviewed_count: reviewed.length,
      revoked_count: revoked.length,
      total_users: reviewItems.length,
    }, {
      module: 'access_control',
      tableName: 'user_profiles',
    });

    try {
      localStorage.setItem(REVIEW_DATE_KEY, new Date().toISOString());
    } catch { /* quota — non-critical */ }

    toast.success(`Access review completed — ${reviewed.length} reviewed, ${revoked.length} flagged for revocation`);
    setIsReviewing(false);
    setReviewItems([]);

    return { revokedUserIds: revoked.map(r => r.userId) };
  }, [reviewItems, log]);

  const cancelReview = useCallback(() => {
    setIsReviewing(false);
    setReviewItems([]);
  }, []);

  return {
    isReviewing,
    reviewItems,
    lastReviewDate,
    daysSinceLastReview,
    isOverdue,
    startReview,
    setItemStatus,
    completeReview,
    cancelReview,
  };
}
