import React from 'react';
import CurrencyRatesSection from '@/components/CurrencyRatesSection';
import BudgetsSection from '@/components/BudgetsSection';
import SpendPoliciesSection from '@/components/SpendPoliciesSection';
import AuditLogSection from '@/components/AuditLogSection';
import CompanyProfileSection from '@/components/CompanyProfileSection';
import SubscriptionSection from '@/components/SubscriptionSection';
import DangerZoneSection from '@/components/DangerZoneSection';
import NotificationPreferencesSection from '@/components/NotificationPreferencesSection';
import TripLinkingSection from '@/components/TripLinkingSection';
import ExpenseCategoriesSection from '@/components/ExpenseCategoriesSection';
import { useAuth } from '@/contexts/AuthContext';

const SettingsPage = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.super_admin;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      {isAdmin && <CompanyProfileSection />}
      <SubscriptionSection />
      <NotificationPreferencesSection />
      {isAdmin && <TripLinkingSection />}
      <BudgetsSection />
      {isAdmin && <ExpenseCategoriesSection />}
      <SpendPoliciesSection />
      <CurrencyRatesSection />
      {isAdmin && <AuditLogSection />}
      {isAdmin && <DangerZoneSection />}
    </div>
  );
};

export default SettingsPage;
