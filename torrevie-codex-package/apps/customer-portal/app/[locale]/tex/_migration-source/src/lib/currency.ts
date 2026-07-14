interface FxRate {
  from_currency: string;
  to_currency: string;
  rate: number;
  date: string;
  is_manual_override: boolean | null;
}

interface CurrencyPeg {
  from_currency: string;
  to_currency: string;
  rate: number;
}

interface ConversionResult {
  base_amount: number;
  exchange_rate: number;
  rate_date: string;
  rate_source: 'peg' | 'live' | 'historical' | 'same';
}

/**
 * Convert an amount from one currency to another via USD as intermediate.
 *
 * Checks pegs first, then fx_rates. All conversion goes via USD:
 *   from_currency → USD → to_currency
 *
 * For pegged currencies, the peg rate means: 1 unit of from_currency = X USD
 * For fx_rates, the rate means: 1 USD = X units of from_currency
 *   (so from_currency → USD = amount / rate)
 */
export function convertToBaseCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxRates: FxRate[],
  currencyPegs: CurrencyPeg[]
): ConversionResult | null {
  // Same currency — no conversion needed
  if (fromCurrency === toCurrency) {
    return {
      base_amount: amount,
      exchange_rate: 1,
      rate_date: new Date().toISOString().split('T')[0],
      rate_source: 'same',
    };
  }

  // Helper: get USD value of 1 unit of a currency
  const toUsd = (cur: string): { usdPerUnit: number; source: 'peg' | 'live' | 'historical'; date: string } | null => {
    if (cur === 'USD') return { usdPerUnit: 1, source: 'live', date: new Date().toISOString().split('T')[0] };

    // Check pegs first
    const peg = currencyPegs.find(p => p.from_currency === cur);
    if (peg) {
      return { usdPerUnit: peg.rate, source: 'peg', date: new Date().toISOString().split('T')[0] };
    }

    // Check fx_rates (rate = how many units of currency per 1 USD)
    // Sort by date desc to get most recent
    const ratesForCur = fxRates
      .filter(r => r.from_currency === cur && r.to_currency === 'USD')
      .sort((a, b) => b.date.localeCompare(a.date));

    if (ratesForCur.length > 0) {
      const best = ratesForCur[0];
      // rate in fx_rates: 1 USD = X units of currency, so 1 unit = 1/X USD
      return {
        usdPerUnit: 1 / best.rate,
        source: best.date === new Date().toISOString().split('T')[0] ? 'live' : 'historical',
        date: best.date,
      };
    }

    return null;
  };

  // Helper: get units of a currency per 1 USD
  const fromUsd = (cur: string): { unitsPerUsd: number; source: 'peg' | 'live' | 'historical'; date: string } | null => {
    if (cur === 'USD') return { unitsPerUsd: 1, source: 'live', date: new Date().toISOString().split('T')[0] };

    const peg = currencyPegs.find(p => p.from_currency === cur);
    if (peg) {
      // peg.rate = 1 unit of currency = X USD → 1 USD = 1/X units
      return { unitsPerUsd: 1 / peg.rate, source: 'peg', date: new Date().toISOString().split('T')[0] };
    }

    const ratesForCur = fxRates
      .filter(r => r.from_currency === cur && r.to_currency === 'USD')
      .sort((a, b) => b.date.localeCompare(a.date));

    if (ratesForCur.length > 0) {
      const best = ratesForCur[0];
      return {
        unitsPerUsd: best.rate,
        source: best.date === new Date().toISOString().split('T')[0] ? 'live' : 'historical',
        date: best.date,
      };
    }

    return null;
  };

  const fromUsdResult = toUsd(fromCurrency);
  const toUsdResult = fromUsd(toCurrency);

  if (!fromUsdResult || !toUsdResult) return null;

  const amountInUsd = amount * fromUsdResult.usdPerUnit;
  const baseAmount = amountInUsd * toUsdResult.unitsPerUsd;
  const exchangeRate = baseAmount / amount;

  // Use the most "degraded" source
  const sourceOrder: Array<'peg' | 'live' | 'historical'> = ['peg', 'live', 'historical'];
  const worstSource = sourceOrder.indexOf(fromUsdResult.source) > sourceOrder.indexOf(toUsdResult.source)
    ? fromUsdResult.source
    : toUsdResult.source;

  // Use the oldest date
  const rateDate = fromUsdResult.date < toUsdResult.date ? fromUsdResult.date : toUsdResult.date;

  return {
    base_amount: Math.round(baseAmount * 100) / 100,
    exchange_rate: Math.round(exchangeRate * 1000000) / 1000000,
    rate_date: rateDate,
    rate_source: worstSource,
  };
}