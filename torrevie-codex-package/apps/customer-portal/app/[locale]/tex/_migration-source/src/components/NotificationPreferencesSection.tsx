import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const NOTIFICATION_TYPES = [
  { key: 'expense_submitted', label: 'New expense submitted', description: 'When an employee submits an expense' },
  { key: 'expense_approved', label: 'Expense approved', description: 'When your expense is approved' },
  { key: 'expense_rejected', label: 'Expense rejected', description: 'When your expense is rejected' },
  { key: 'expense_paid', label: 'Expense reimbursed', description: 'When expenses are marked as paid' },
  { key: 'policy_violation', label: 'Policy violations', description: 'When an expense triggers a policy flag' },
  { key: 'budget_warning', label: 'Budget warnings', description: 'When a budget reaches 80%' },
  { key: 'budget_exceeded', label: 'Budget exceeded', description: 'When a budget is exceeded' },
  { key: 'sync_complete', label: 'Offline sync complete', description: 'When offline expenses finish syncing' },
  { key: 'trip_budget_warning', label: 'Trip budget warnings', description: 'When a trip budget reaches 80%' },
];

const NotificationPreferencesSection = () => {
  const { user, profile } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      const defaults: Record<string, boolean> = {};
      NOTIFICATION_TYPES.forEach(t => { defaults[t.key] = true; });
      const saved = (profile as any).notification_preferences;
      setPrefs({ ...defaults, ...(saved ?? {}) });
    }
  }, [profile]);

  const toggle = async (key: string) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    await supabase.from('profiles').update({ notification_preferences: updated } as any).eq('id', user!.id);
    setSaving(false);
    toast.success('Notification preferences updated');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Notification Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {NOTIFICATION_TYPES.map(t => (
          <div key={t.key} className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">{t.label}</Label>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
            <Switch checked={prefs[t.key] ?? true} onCheckedChange={() => toggle(t.key)} disabled={saving} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default NotificationPreferencesSection;
