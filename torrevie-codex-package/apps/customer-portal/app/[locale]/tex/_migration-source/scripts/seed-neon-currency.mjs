import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required to seed TEX currency data.');
  process.exit(1);
}

const countryConfigs = [
  {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    baseCurrency: 'AED',
    currencyName: 'UAE Dirham',
    currencySymbol: 'AED',
    hasVat: true,
    vatRate: 5,
    taxName: 'VAT',
    taxIdLabel: 'TRN',
    taxAuthorityName: 'Federal Tax Authority',
  },
  {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    baseCurrency: 'SAR',
    currencyName: 'Saudi Riyal',
    currencySymbol: 'SAR',
    hasVat: true,
    vatRate: 15,
    taxName: 'VAT',
    taxIdLabel: 'VAT Number',
    taxAuthorityName: 'Zakat, Tax and Customs Authority',
  },
  {
    countryCode: 'BH',
    countryName: 'Bahrain',
    baseCurrency: 'BHD',
    currencyName: 'Bahraini Dinar',
    currencySymbol: 'BHD',
    hasVat: true,
    vatRate: 10,
    taxName: 'VAT',
    taxIdLabel: 'VAT Number',
    taxAuthorityName: 'National Bureau for Revenue',
  },
  {
    countryCode: 'KW',
    countryName: 'Kuwait',
    baseCurrency: 'KWD',
    currencyName: 'Kuwaiti Dinar',
    currencySymbol: 'KWD',
    hasVat: false,
    vatRate: 0,
    taxName: 'VAT',
    taxIdLabel: 'Tax Number',
    taxAuthorityName: 'Kuwait Tax Authority',
  },
  {
    countryCode: 'OM',
    countryName: 'Oman',
    baseCurrency: 'OMR',
    currencyName: 'Omani Rial',
    currencySymbol: 'OMR',
    hasVat: true,
    vatRate: 5,
    taxName: 'VAT',
    taxIdLabel: 'VAT Number',
    taxAuthorityName: 'Oman Tax Authority',
  },
  {
    countryCode: 'QA',
    countryName: 'Qatar',
    baseCurrency: 'QAR',
    currencyName: 'Qatari Riyal',
    currencySymbol: 'QAR',
    hasVat: false,
    vatRate: 0,
    taxName: 'VAT',
    taxIdLabel: 'Tax Number',
    taxAuthorityName: 'General Tax Authority',
  },
];

const usdPegs = [
  {
    fromCurrency: 'AED',
    rate: 0.272294,
    effectiveFrom: '1997-11-01',
    notes: 'UAE dirham fixed peg: 1 USD = 3.6725 AED',
  },
  {
    fromCurrency: 'SAR',
    rate: 0.266667,
    effectiveFrom: '1986-06-01',
    notes: 'Saudi riyal fixed peg: 1 USD = 3.75 SAR',
  },
  {
    fromCurrency: 'BHD',
    rate: 2.659574,
    effectiveFrom: '2001-01-01',
    notes: 'Bahraini dinar fixed peg: 1 USD = 0.376 BHD',
  },
  {
    fromCurrency: 'OMR',
    rate: 2.597403,
    effectiveFrom: '1986-01-01',
    notes: 'Omani rial fixed peg: 1 USD = 0.385 OMR',
  },
  {
    fromCurrency: 'QAR',
    rate: 0.274725,
    effectiveFrom: '2001-07-01',
    notes: 'Qatari riyal fixed peg: 1 USD = 3.64 QAR',
  },
];

const sql = neon(connectionString);

for (const config of countryConfigs) {
  await sql`
    insert into country_configs (
      country_code,
      country_name,
      base_currency,
      currency_name,
      currency_symbol,
      has_vat,
      vat_rate,
      tax_name,
      tax_id_label,
      tax_authority_name
    ) values (
      ${config.countryCode},
      ${config.countryName},
      ${config.baseCurrency},
      ${config.currencyName},
      ${config.currencySymbol},
      ${config.hasVat},
      ${config.vatRate},
      ${config.taxName},
      ${config.taxIdLabel},
      ${config.taxAuthorityName}
    ) on conflict (country_code) do update set
      country_name = excluded.country_name,
      base_currency = excluded.base_currency,
      currency_name = excluded.currency_name,
      currency_symbol = excluded.currency_symbol,
      has_vat = excluded.has_vat,
      vat_rate = excluded.vat_rate,
      tax_name = excluded.tax_name,
      tax_id_label = excluded.tax_id_label,
      tax_authority_name = excluded.tax_authority_name
  `;
}

for (const peg of usdPegs) {
  await sql`
    insert into currency_pegs (
      from_currency,
      to_currency,
      rate,
      effective_from,
      notes
    ) values (
      ${peg.fromCurrency},
      'USD',
      ${peg.rate},
      ${peg.effectiveFrom},
      ${peg.notes}
    ) on conflict (from_currency, to_currency, effective_from) do update set
      rate = excluded.rate,
      notes = excluded.notes
  `;
}

await sql`
  update companies
  set
    country_code = coalesce(nullif(country_code, ''), 'AE'),
    base_currency = coalesce(nullif(base_currency, ''), 'AED')
  where name = 'Torrevie'
`;

console.log('Seeded TEX GCC currency baseline.');
