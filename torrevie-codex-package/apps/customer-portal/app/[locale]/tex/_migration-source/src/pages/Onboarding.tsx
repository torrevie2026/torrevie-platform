import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, Plus, X } from 'lucide-react';

interface CountryConfig {
  country_code: string;
  country_name: string;
  base_currency: string;
  currency_name: string;
  vat_rate: number;
  tax_name: string | null;
}

const COUNTRY_PREFIX: Record<string, string> = {
  AE: 'AE', SA: 'SA', BH: 'BH', OM: 'OM', KW: 'KW', QA: 'QA',
  EG: 'EG', JO: 'JO', ZA: 'ZA', KE: 'KE', NG: 'NG', MA: 'MA',
  GB: 'GB', DE: 'DE', FR: 'FR', ES: 'ES', IT: 'IT', NL: 'NL',
};

type ManagerEntry = { name: string; email: string; reportsTo: string };

const Onboarding = () => {
  const { user, profile, companies = [], refreshProfile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [countries, setCountries] = useState<CountryConfig[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [fullNameTouched, setFullNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ceoName, setCeoName] = useState('');
  const [managers, setManagers] = useState<ManagerEntry[]>([]);

  const selectedConfig = countries.find(c => c.country_code === selectedCountry);

  useEffect(() => {
    let active = true;
    apiRequest<{ countries: CountryConfig[] }>('/api/tex/onboarding/countries')
      .then(({ countries: countryRows }) => {
        if (active) setCountries(countryRows || []);
      })
      .catch((error) => {
        if (active) toast.error((error as Error).message || 'Could not load countries');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!fullNameTouched && !fullName && profile?.full_name) setFullName(profile.full_name);
  }, [profile, fullName, fullNameTouched]);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.super_admin) {
      navigate('/admin', { replace: true });
      return;
    }
    if (profile.company_id || companies.length > 0) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, profile, companies.length, navigate]);

  const handleComplete = async () => {
    if (!user) return;
    const config = countries.find(c => c.country_code === selectedCountry);
    if (!config) {
      toast.error('Please select a configured country');
      return;
    }
    setLoading(true);

    try {
      await apiRequest('/api/tex/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          company_name: companyName,
          country_code: selectedCountry,
          full_name: fullName,
          ceo_name: ceoName,
        }),
      });
      await refreshProfile();
      toast.success('Welcome to TEX!');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error((error as Error).message || 'Could not complete setup');
    } finally {
      setLoading(false);
    }
  };

  const addManager = () => {
    setManagers([...managers, { name: '', email: '', reportsTo: 'ceo' }]);
  };

  const removeManager = (idx: number) => {
    setManagers(managers.filter((_, i) => i !== idx));
  };

  const updateManager = (idx: number, field: keyof ManagerEntry, value: string) => {
    const next = [...managers];
    next[idx] = { ...next[idx], [field]: value };
    setManagers(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-2 rounded-full transition-all ${s <= step ? 'w-10 bg-primary' : 'w-6 bg-muted'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">Set up your company</h2>
              <p className="text-muted-foreground mt-1">Tell us about your organization</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" placeholder="Acme Trading LLC" value={companyName} onChange={e => setCompanyName(e.target.value)} required className="rounded-md" />
              </div>
              <div>
                <Label>Country</Label>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                  <SelectTrigger className="rounded-md"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {countries.map(c => (
                      <SelectItem key={c.country_code} value={c.country_code}>
                        {COUNTRY_PREFIX[c.country_code] || c.country_code} {c.country_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedConfig && (
                <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
                  <p><span className="font-medium">Base currency:</span> {selectedConfig.currency_name} ({selectedConfig.base_currency})</p>
                  <p><span className="font-medium">Tax rate:</span> {selectedConfig.vat_rate}% {selectedConfig.tax_name}</p>
                </div>
              )}
            </div>
            <Button className="w-full rounded-md" disabled={!companyName || !selectedCountry} onClick={() => setStep(2)}>Continue</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">Your Profile</h2>
              <p className="text-muted-foreground mt-1">Confirm your details</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="fullName">Your Full Name</Label>
                <Input id="fullName" value={fullName} onChange={e => { setFullName(e.target.value); setFullNameTouched(true); }} required className="rounded-md" />
              </div>
              <div>
                <Label htmlFor="ceoName">Who is at the top of your organization?</Label>
                <Input id="ceoName" placeholder="Leave blank if it is you" value={ceoName} onChange={e => setCeoName(e.target.value)} className="rounded-md" />
                <p className="text-xs text-muted-foreground mt-1">This person's expenses go directly to finance with no manager approval needed.</p>
              </div>
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-medium">You will be set as the Admin of {companyName}.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-md" onClick={() => setStep(1)}>Back</Button>
              <Button className="flex-1 rounded-md" disabled={!fullName} onClick={() => setStep(3)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">Set up your approval chain</h2>
              <p className="text-muted-foreground mt-1">Add managers. You can add more employees later.</p>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                <p className="font-medium text-foreground">{ceoName || fullName} - CEO</p>
                <p className="text-xs text-muted-foreground mt-0.5">Expenses go directly to finance</p>
              </div>

              {managers.map((m, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2 relative">
                  <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => removeManager(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                  <Input placeholder="Manager name" value={m.name} onChange={e => updateManager(i, 'name', e.target.value)} className="h-8 text-sm" />
                  <Input placeholder="Email for invite" value={m.email} onChange={e => updateManager(i, 'email', e.target.value)} className="h-8 text-sm" />
                  <Select value={m.reportsTo} onValueChange={v => updateManager(i, 'reportsTo', v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Reports to" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ceo">{ceoName || fullName} (CEO)</SelectItem>
                      {managers.filter((_, j) => j !== i).map((other, j) => (
                        <SelectItem key={j} value={`mgr-${j}`}>{other.name || `Manager ${j + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addManager} className="w-full gap-1">
                <Plus className="h-3 w-3" /> Add a manager
              </Button>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-md" onClick={() => setStep(2)}>Back</Button>
              <Button className="flex-1 rounded-md" onClick={() => setStep(4)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
            <div>
              <h2 className="text-2xl font-bold text-foreground">TEX is ready for {companyName}</h2>
              <p className="text-muted-foreground mt-2">
                Your approval chain is set up. Expenses will automatically route to the right manager for approval.
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm text-left space-y-2">
              <div>
                <p className="font-medium">Approval Chain</p>
                <p className="text-muted-foreground">Employees to Manager to Finance to Paid</p>
              </div>
              <div>
                <p className="font-medium">WhatsApp Expense Submission</p>
                <p className="text-muted-foreground">Your team can submit receipts directly via WhatsApp by sending a photo.</p>
              </div>
            </div>
            <Button className="w-full rounded-md" onClick={handleComplete} disabled={loading}>
              {loading ? 'Setting up...' : 'Go to Dashboard'}
            </Button>
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-2">
          {profile?.company_id || companies.length > 0 ? (
            <Button variant="link" size="sm" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </Button>
          ) : (
            <Button variant="link" size="sm" onClick={async () => { await signOut(); navigate('/login'); }}>
              Sign out
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            onClick={async () => { await signOut(); navigate('/demo'); }}
          >
            Just looking around? Try the demo tenant
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
