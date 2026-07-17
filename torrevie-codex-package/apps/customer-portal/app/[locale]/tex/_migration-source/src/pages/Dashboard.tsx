import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import EmployeeDashboard from '@/components/dashboard/EmployeeDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import SuperAdminDashboard from '@/components/dashboard/SuperAdminDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import FinanceDashboard from '@/components/dashboard/FinanceDashboard';

const Dashboard = () => {
  const { profile, selectedCompanyId, loading, hasDirectReports } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading…</div>;
  }

  // Super admin with no company selected → platform overview
  if (profile?.super_admin && !selectedCompanyId) {
    return <SuperAdminDashboard />;
  }

  // Admin role → full admin/manager dashboard
  if (profile?.role === 'admin') {
    return <AdminDashboard />;
  }

  // Finance role → finance-focused dashboard
  if (profile?.role === 'finance') {
    return <FinanceDashboard />;
  }

  // Manager (has direct reports) → manager dashboard
  if (hasDirectReports) {
    return <ManagerDashboard />;
  }

  // Employee (default)
  return <EmployeeDashboard />;
};

export default Dashboard;
