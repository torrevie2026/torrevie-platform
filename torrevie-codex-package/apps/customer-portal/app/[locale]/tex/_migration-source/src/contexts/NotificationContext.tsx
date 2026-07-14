import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationType } from '@/lib/notifications';
import { apiRequest } from '@/lib/api';

export interface Notification {
  id: string;
  company_id: string;
  user_id: string | null;
  title: string;
  body: string;
  type: NotificationType | string;
  related_expense_id: string | null;
  related_trip_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, selectedCompanyId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user || !selectedCompanyId) { setNotifications([]); setLoading(false); return; }
    try {
      const data = await apiRequest<{ notifications: Notification[] }>(
        `/api/tex/notifications?company_id=${encodeURIComponent(selectedCompanyId)}`,
      );
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, [user, selectedCompanyId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, selectedCompanyId]);

  useEffect(() => {
    if (!user || !selectedCompanyId) return;
    const interval = window.setInterval(() => {
      fetchNotifications().catch(() => null);
    }, 30000);
    return () => window.clearInterval(interval);
  }, [user, selectedCompanyId, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await apiRequest(`/api/tex/notifications/${id}/read`, { method: 'PATCH', body: JSON.stringify({}) });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllAsRead = async () => {
    if (!selectedCompanyId || notifications.every(n => n.is_read)) return;
    await apiRequest('/api/tex/notifications/read-all', {
      method: 'PATCH',
      body: JSON.stringify({ company_id: selectedCompanyId }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, loading,
      markAsRead, markAllAsRead, refreshNotifications: fetchNotifications,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
