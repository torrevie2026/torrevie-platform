import { apiRequest } from '@/lib/api';

export type NotificationType =
  | 'expense_submitted' | 'expense_approved' | 'expense_rejected' | 'expense_paid'
  | 'policy_violation' | 'budget_warning' | 'budget_exceeded'
  | 'sync_complete' | 'trip_budget_warning' | 'wappfly_unregistered';

interface CreateNotificationParams {
  companyId: string;
  userId?: string | null; // null = broadcast to admins
  title: string;
  body: string;
  type: NotificationType;
  relatedExpenseId?: string | null;
  relatedTripId?: string | null;
}

export const createNotification = async (params: CreateNotificationParams) => {
  try {
    await apiRequest('/api/tex/notifications', {
      method: 'POST',
      body: JSON.stringify({
        company_id: params.companyId,
        user_id: params.userId || null,
        title: params.title,
        body: params.body,
        type: params.type,
        related_expense_id: params.relatedExpenseId || null,
        related_trip_id: params.relatedTripId || null,
      }),
    });
  } catch (e) {
    console.error('Failed to create notification:', e);
  }
};

// Notify all admins in a company (insert with user_id = null → RLS lets admins see)
export const notifyAdmins = async (
  companyId: string,
  title: string,
  body: string,
  type: NotificationType,
  relatedExpenseId?: string | null,
  relatedTripId?: string | null,
) => {
  await createNotification({ companyId, userId: null, title, body, type, relatedExpenseId, relatedTripId });
};

// Notify a specific user by their profile id
export const notifyUser = async (
  companyId: string,
  userId: string,
  title: string,
  body: string,
  type: NotificationType,
  relatedExpenseId?: string | null,
  relatedTripId?: string | null,
) => {
  await createNotification({ companyId, userId, title, body, type, relatedExpenseId, relatedTripId });
};
