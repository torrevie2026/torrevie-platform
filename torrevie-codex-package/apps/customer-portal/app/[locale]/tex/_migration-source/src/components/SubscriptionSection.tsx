import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const planColors: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-800 border-amber-200',
  starter: 'bg-blue-100 text-blue-800 border-blue-200',
  business: 'bg-primary/10 text-primary border-primary/20',
  enterprise: 'bg-purple-100 text-purple-800 border-purple-200',
};

const SubscriptionSection: React.FC = () => {
  const { selectedCompanyId } = useAuth();
  const [plan, setPlan] = useState('trial');
  const [trialExpiry, setTrialExpiry] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;
    apiRequest<{ company: { plan: string | null; trial_expires_at: string | null } }>(
      `/api/tex/settings/company?company_id=${encodeURIComponent(selectedCompanyId)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setPlan(data.company.plan ?? 'trial');
        setTrialExpiry(data.company.trial_expires_at);
      })
      .catch(() => {
        if (!cancelled) {
          setPlan('trial');
          setTrialExpiry(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  const isTrialExpired = trialExpiry ? new Date(trialExpiry) < new Date() : false;

  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Subscription</h2>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-muted-foreground">Current Plan:</span>
        <Badge variant="outline" className={cn('capitalize', planColors[plan] ?? '')}>{plan}</Badge>
      </div>
      {plan === 'trial' && trialExpiry && (
        <p className={cn('text-sm mb-3', isTrialExpired ? 'text-destructive' : 'text-muted-foreground')}>
          {isTrialExpired ? 'Trial expired on ' : 'Trial expires '}{format(new Date(trialExpiry), 'dd MMM yyyy')}
        </p>
      )}
      <Button variant="outline" disabled>
        Upgrade Plan (Coming Soon)
      </Button>
    </div>
  );
};

export default SubscriptionSection;
