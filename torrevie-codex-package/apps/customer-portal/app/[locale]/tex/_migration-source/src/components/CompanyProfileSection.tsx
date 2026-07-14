import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, Upload, Trash2, CheckCircle2, Copy } from 'lucide-react';

type WhatsAppProvider = 'ultramsg' | 'wappfly' | 'meta';

const CompanyProfileSection: React.FC = () => {
  const { user, selectedCompanyId } = useAuth();
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [taxRegNumber, setTaxRegNumber] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('');
  // WhatsApp provider state
  const [whatsappProvider, setWhatsappProvider] = useState<WhatsAppProvider>('ultramsg');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');
  const [wappflySessionId, setWappflySessionId] = useState('');
  const [wappflyTokenInput, setWappflyTokenInput] = useState('');
  const [wappflyTokenSet, setWappflyTokenSet] = useState(false);
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState('');
  const [metaTokenSet, setMetaTokenSet] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [countries, setCountries] = useState<{ country_code: string; country_name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [wappflyWebhookUrl, setWappflyWebhookUrl] = useState<string>('');
  const [loadingWebhookUrl, setLoadingWebhookUrl] = useState(false);
  const metaWebhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/meta-whatsapp`
    : '';

  useEffect(() => {
    if (!selectedCompanyId) return;
    const load = async () => {
      try {
        const data = await apiRequest<{
          company: {
            name: string;
            country_code: string;
            base_currency: string;
            logo_url: string | null;
            tax_registration_number: string | null;
            whatsapp_provider: WhatsAppProvider;
            whatsapp_instance_id: string | null;
            wappfly_session_id: string | null;
            wappfly_token_set: boolean;
            meta_phone_number_id: string | null;
            meta_whatsapp_business_account_id: string | null;
            meta_token_set: boolean;
          };
          countries: { country_code: string; country_name: string }[];
        }>(`/api/tex/settings/company?company_id=${encodeURIComponent(selectedCompanyId)}`);
        setName(data.company.name);
        setCountryCode(data.company.country_code);
        setBaseCurrency(data.company.base_currency);
        setLogoPath(data.company.logo_url ?? null);
        setLogoPreviewUrl(data.company.logo_url?.startsWith('http') ? data.company.logo_url : null);
        setTaxRegNumber(data.company.tax_registration_number ?? '');
        setWhatsappProvider(data.company.whatsapp_provider || 'ultramsg');
        setWhatsappInstanceId(data.company.whatsapp_instance_id ?? '');
        setWappflySessionId(data.company.wappfly_session_id ?? '');
        setWappflyTokenSet(!!data.company.wappfly_token_set);
        setMetaPhoneNumberId(data.company.meta_phone_number_id ?? '');
        setMetaBusinessAccountId(data.company.meta_whatsapp_business_account_id ?? '');
        setMetaTokenSet(!!data.company.meta_token_set);
        setCountries(data.countries);
      } catch (error) {
        toast.error((error as Error).message || 'Failed to load company profile');
      }
    };
    load();
  }, [selectedCompanyId]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompanyId) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }
    setUploadingLogo(false);
    toast.info('Logo storage is pending the Neon storage replacement. Company details can be saved now.');
    setUploadingLogo(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogoRemove = async () => {
    if (!selectedCompanyId || !logoPath) return;
    toast.info('Logo removal is pending the Neon storage replacement.');
  };

  const handleCopyWebhook = async () => {
    try {
      setLoadingWebhookUrl(true);
      let urlToCopy = wappflyWebhookUrl;
      if (!urlToCopy) {
        urlToCopy = `${window.location.origin}/api/webhooks/wappfly`;
        setWappflyWebhookUrl(urlToCopy);
      }
      await navigator.clipboard.writeText(urlToCopy);
      toast.success('Webhook URL copied — paste it into Wappfly');
    } catch (e: any) {
      toast.error('Copy failed: ' + (e?.message || 'unknown error'));
    } finally {
      setLoadingWebhookUrl(false);
    }
  };

  const handleCopyMetaWebhook = async () => {
    try {
      await navigator.clipboard.writeText(metaWebhookUrl);
      toast.success('Meta callback URL copied');
    } catch (e: any) {
      toast.error('Copy failed: ' + (e?.message || 'unknown error'));
    }
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !name.trim()) return;
    setSaving(true);
    try {
      const data = await apiRequest<{
        company: {
          name: string;
          country_code: string;
          base_currency: string;
          tax_registration_number: string | null;
          whatsapp_provider: WhatsAppProvider;
          whatsapp_instance_id: string | null;
          wappfly_session_id: string | null;
          wappfly_token_set: boolean;
          meta_phone_number_id: string | null;
          meta_whatsapp_business_account_id: string | null;
          meta_token_set: boolean;
        };
      }>('/api/tex/settings/company', {
        method: 'PATCH',
        body: JSON.stringify({
          company_id: selectedCompanyId,
          name: name.trim(),
          country_code: countryCode,
          tax_registration_number: taxRegNumber.trim() || null,
          whatsapp_provider: whatsappProvider,
          whatsapp_instance_id: whatsappInstanceId.trim() || null,
          wappfly_session_id: wappflySessionId.trim() || null,
          meta_phone_number_id: metaPhoneNumberId.trim() || null,
          meta_whatsapp_business_account_id: metaBusinessAccountId.trim() || null,
          wappfly_api_token: wappflyTokenInput,
        }),
      });
      setName(data.company.name);
      setCountryCode(data.company.country_code);
      setBaseCurrency(data.company.base_currency);
      setTaxRegNumber(data.company.tax_registration_number ?? '');
      setWhatsappProvider(data.company.whatsapp_provider || 'ultramsg');
      setWhatsappInstanceId(data.company.whatsapp_instance_id ?? '');
      setWappflySessionId(data.company.wappfly_session_id ?? '');
      setWappflyTokenSet(!!data.company.wappfly_token_set);
      setMetaPhoneNumberId(data.company.meta_phone_number_id ?? '');
      setMetaBusinessAccountId(data.company.meta_whatsapp_business_account_id ?? '');
      setMetaTokenSet(!!data.company.meta_token_set);
      if (wappflyTokenInput.trim()) {
        setWappflyTokenInput('');
      }
      toast.success('Company profile updated');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update company profile');
    }
    setSaving(false);
  };

  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Company Profile</h2>
      </div>

      <div className="mb-5">
        <Label>Company Logo</Label>
        <div className="mt-2 flex items-center gap-4">
          <div className="h-20 w-20 rounded border bg-muted flex items-center justify-center overflow-hidden">
            {logoPreviewUrl ? (
              <img src={logoPreviewUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>
                <Upload className="h-4 w-4 mr-1" />
                {uploadingLogo ? 'Uploading…' : logoPath ? 'Replace' : 'Upload'}
              </Button>
              {logoPath && (
                <Button type="button" variant="ghost" size="sm" onClick={handleLogoRemove}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP. Max 2MB.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Company Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <Label>Country</Label>
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {countries.map(c => (
                <SelectItem key={c.country_code} value={c.country_code}>{c.country_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tax Registration Number</Label>
          <Input value={taxRegNumber} onChange={e => setTaxRegNumber(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <Label>Base Currency</Label>
          <Input value={baseCurrency} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground mt-1">Currency cannot be changed after setup</p>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t">
        <h3 className="text-sm font-semibold text-foreground mb-3">WhatsApp Provider</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Provider</Label>
            <Select value={whatsappProvider} onValueChange={(v) => setWhatsappProvider(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ultramsg">UltraMsg</SelectItem>
                <SelectItem value="wappfly">Wappfly</SelectItem>
                <SelectItem value="meta">Meta WhatsApp Cloud API</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {whatsappProvider === 'ultramsg' && (
          <div className="mt-4">
            <Label>UltraMsg Instance ID</Label>
            <Input
              value={whatsappInstanceId}
              onChange={e => setWhatsappInstanceId(e.target.value)}
              placeholder="e.g. 123456 (from your UltraMsg console)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Routes inbound WhatsApp receipts to this company. Each company should use its own UltraMsg instance.
            </p>
          </div>
        )}

        {whatsappProvider === 'wappfly' && (
          <div className="mt-4 space-y-4">
            <div>
              <Label>Wappfly X-API-Token</Label>
              <Input
                type="password"
                value={wappflyTokenInput}
                onChange={e => setWappflyTokenInput(e.target.value)}
                placeholder={wappflyTokenSet ? '•••••••• (saved — type to replace)' : 'Paste the token from your Wappfly dashboard'}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground mt-1">
                One token per WhatsApp line. Get it from <span className="font-mono">wappfly.com/dashboard</span> → click <em>Show token</em>. Stored server-side; never shown to other users.
              </p>
            </div>
            <div>
              <Label>Wappfly Session ID</Label>
              <Input
                value={wappflySessionId}
                onChange={e => setWappflySessionId(e.target.value)}
                placeholder="e.g. 8"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The numeric session id Wappfly includes in every inbound webhook. Used to route incoming messages to this company.
              </p>
            </div>
            <div>
              <Label>Inbound Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={wappflyWebhookUrl || 'Click Copy to reveal your secure webhook URL'}
                  readOnly
                  className="font-mono text-xs bg-muted"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleCopyWebhook} disabled={loadingWebhookUrl}>
                  {loadingWebhookUrl ? '...' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Paste this URL into Wappfly → your number → <em>Inbound webhook</em>. It contains a shared secret, so only share it with Wappfly.
              </p>
            </div>
          </div>
        )}

        {whatsappProvider === 'meta' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border bg-muted/40 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className={`mt-0.5 h-4 w-4 ${metaTokenSet ? 'text-primary' : 'text-warning'}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Meta Cloud API {metaTokenSet ? 'access token is configured' : 'access token is not configured'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The token is stored server-side in Vercel and is never shown in the browser.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Meta Phone Number ID</Label>
                <Input
                  value={metaPhoneNumberId}
                  onChange={e => setMetaPhoneNumberId(e.target.value)}
                  placeholder="e.g. 1151371448067833"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Routes incoming Cloud API messages for this WhatsApp number to this company.
                </p>
              </div>
              <div>
                <Label>WhatsApp Business Account ID</Label>
                <Input
                  value={metaBusinessAccountId}
                  onChange={e => setMetaBusinessAccountId(e.target.value)}
                  placeholder="e.g. 1046937467771873"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for administration and confirming the connected WABA.
                </p>
              </div>
            </div>
            <div>
              <Label>Meta Callback URL</Label>
              <div className="flex gap-2">
                <Input value={metaWebhookUrl} readOnly className="font-mono text-xs bg-muted" />
                <Button type="button" variant="outline" size="sm" onClick={handleCopyMetaWebhook}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Subscribe the Meta WhatsApp <span className="font-mono">messages</span> webhook field to this callback.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
      </div>
    </div>
  );
};

export default CompanyProfileSection;
