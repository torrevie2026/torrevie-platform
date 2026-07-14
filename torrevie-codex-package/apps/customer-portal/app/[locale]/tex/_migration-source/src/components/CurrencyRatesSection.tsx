import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Pencil, RotateCcw, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FxRateRow {
  id: string;
  date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  is_manual_override: boolean | null;
  created_at: string | null;
}

interface CurrencyPeg {
  from_currency: string;
  rate: number;
}

const CURRENCY_NAMES: Record<string, string> = {
  AED: 'UAE Dirham', SAR: 'Saudi Riyal', BHD: 'Bahraini Dinar', OMR: 'Omani Rial',
  KWD: 'Kuwaiti Dinar', QAR: 'Qatari Riyal', JOD: 'Jordanian Dinar',
  EUR: 'Euro', GBP: 'British Pound', EGP: 'Egyptian Pound', KES: 'Kenyan Shilling',
  NGN: 'Nigerian Naira', ZAR: 'South African Rand', MAD: 'Moroccan Dirham',
  CHF: 'Swiss Franc', SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone',
  PLN: 'Polish Zloty', CZK: 'Czech Koruna', HUF: 'Hungarian Forint', TRY: 'Turkish Lira',
  INR: 'Indian Rupee', PKR: 'Pakistani Rupee', CAD: 'Canadian Dollar', AUD: 'Australian Dollar',
  JPY: 'Japanese Yen', CNY: 'Chinese Yuan', USD: 'US Dollar',
};

const CurrencyRatesSection: React.FC = () => {
  const { selectedCompanyId } = useAuth();
  const [rates, setRates] = useState<FxRateRow[]>([]);
  const [pegs, setPegs] = useState<CurrencyPeg[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('AED');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    // Get company base currency
    if (selectedCompanyId) {
      const { data: company } = await supabase
        .from('companies')
        .select('base_currency')
        .eq('id', selectedCompanyId)
        .single();
      if (company) setBaseCurrency(company.base_currency);
    }

    // Get today's rates
    const { data: rateData } = await supabase
      .from('fx_rates')
      .select('*')
      .eq('date', today)
      .eq('to_currency', 'USD')
      .order('from_currency');
    if (rateData) setRates(rateData);

    // Get pegs
    const { data: pegData } = await supabase
      .from('currency_pegs')
      .select('from_currency, rate');
    if (pegData) setPegs(pegData);
  };

  useEffect(() => {
    loadData();
  }, [selectedCompanyId]);

  const isPegged = (cur: string) => pegs.some(p => p.from_currency === cur);

  const getBaseRate = (usdRate: number, cur: string): string => {
    if (baseCurrency === 'USD') return usdRate.toFixed(4);
    if (baseCurrency === cur) return '1.0000';

    // Find base currency's USD rate
    const basePeg = pegs.find(p => p.from_currency === baseCurrency);
    const baseRateRow = rates.find(r => r.from_currency === baseCurrency);

    let baseToUsd: number | null = null;
    if (baseCurrency === 'USD') baseToUsd = 1;
    else if (basePeg) baseToUsd = basePeg.rate; // 1 base = X USD
    else if (baseRateRow) baseToUsd = 1 / baseRateRow.rate; // rate = units per USD

    if (baseToUsd == null) return '—';

    // cur → USD → base
    const curUsdValue = 1 / usdRate; // 1 unit of cur = X USD
    const result = curUsdValue / baseToUsd; // X USD / (1 base = Y USD)
    return result.toFixed(4);
  };

  const handleSaveOverride = async (row: FxRateRow) => {
    const newRate = parseFloat(editRate);
    if (isNaN(newRate) || newRate <= 0) {
      toast.error('Enter a valid rate');
      return;
    }

    // Delete existing and insert with override flag
    await supabase.from('fx_rates').delete().eq('id', row.id);

    const { error } = await supabase.from('fx_rates').insert({
      date: today,
      from_currency: row.from_currency,
      to_currency: 'USD',
      rate: newRate,
      is_manual_override: true,
    });

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success(`${row.from_currency} rate overridden`);
      setEditingId(null);
      loadData();
    }
  };

  const handleResetOverride = async (row: FxRateRow) => {
    // Delete the override — next daily fetch will repopulate
    const { error } = await supabase.from('fx_rates').delete().eq('id', row.id);
    if (error) {
      toast.error('Failed to reset: ' + error.message);
    } else {
      toast.success(`${row.from_currency} override removed`);
      loadData();
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-fx-rates');
      if (error) throw error;
      toast.success(`Rates updated: ${data?.updated || 0} currencies`);
      loadData();
    } catch (e: any) {
      toast.error('Failed to refresh rates: ' + (e.message || 'Unknown error'));
    }
    setRefreshing(false);
  };

  // Combine pegged currencies that might not be in today's rates
  const allRows: Array<{ currency: string; rate: number; source: 'peg' | 'live' | 'manual'; id?: string; isOverride: boolean }> = [];

  for (const peg of pegs) {
    const existing = rates.find(r => r.from_currency === peg.from_currency);
    allRows.push({
      currency: peg.from_currency,
      rate: existing?.rate || (1 / peg.rate), // convert peg rate to "units per USD" format
      source: 'peg',
      id: existing?.id,
      isOverride: false,
    });
  }

  for (const row of rates) {
    if (!allRows.some(r => r.currency === row.from_currency)) {
      allRows.push({
        currency: row.from_currency,
        rate: row.rate,
        source: row.is_manual_override ? 'manual' : 'live',
        id: row.id,
        isOverride: row.is_manual_override === true,
      });
    }
  }

  allRows.sort((a, b) => a.currency.localeCompare(b.currency));

  return (
    <div className="bg-card rounded-lg shadow-sm border">
      <div className="flex items-center justify-between p-5 border-b">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Currency Rates</h2>
          <p className="text-sm text-muted-foreground">Today's exchange rates (vs USD). Updated daily at 04:00 UTC.</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-md" onClick={handleManualRefresh} disabled={refreshing}>
          <RefreshCw className={cn('h-4 w-4 mr-1', refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh Now'}
        </Button>
      </div>

      {allRows.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          No rates available. Click "Refresh Now" to fetch today's rates.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Currency</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Rate (per USD)</th>
                <th className="text-right p-3 font-medium text-muted-foreground hidden sm:table-cell">Rate (per {baseCurrency})</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Source</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map(row => (
                <tr key={row.currency} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <span className="font-medium text-foreground">{row.currency}</span>
                    <span className="text-muted-foreground ml-2 text-xs hidden sm:inline">{CURRENCY_NAMES[row.currency] || ''}</span>
                  </td>
                  <td className="p-3 text-right font-mono text-foreground">
                    {editingId === row.id ? (
                      <Input
                        type="number"
                        step="0.000001"
                        value={editRate}
                        onChange={e => setEditRate(e.target.value)}
                        className="w-28 ml-auto rounded-md text-right"
                        autoFocus
                      />
                    ) : (
                      row.rate.toFixed(4)
                    )}
                  </td>
                  <td className="p-3 text-right font-mono text-foreground hidden sm:table-cell">
                    {row.currency === baseCurrency ? '—' : getBaseRate(row.rate, row.currency)}
                  </td>
                  <td className="p-3 text-center">
                    {row.source === 'peg' && <Badge variant="outline" className="text-xs">Fixed Peg</Badge>}
                    {row.source === 'live' && <Badge className="text-xs bg-success text-success-foreground">Live</Badge>}
                    {row.source === 'manual' && <Badge className="text-xs bg-warning text-warning-foreground">Manual</Badge>}
                  </td>
                  <td className="p-3 text-right">
                    {row.source !== 'peg' && (
                      <div className="flex items-center justify-end gap-1">
                        {editingId === row.id ? (
                          <>
                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                            <Button size="sm" className="text-xs rounded-md" onClick={() => handleSaveOverride(rates.find(r => r.id === row.id)!)}>Save</Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => { setEditingId(row.id!); setEditRate(String(row.rate)); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {row.isOverride && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => handleResetOverride(rates.find(r => r.id === row.id)!)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CurrencyRatesSection;