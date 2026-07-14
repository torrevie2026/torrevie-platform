import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const adminName = process.env.ADMIN_NAME || 'TEX Administrator';
const companyName = process.env.COMPANY_NAME || 'Torrevie';
const countryCode = process.env.COMPANY_COUNTRY_CODE || 'AE';
const baseCurrency = process.env.COMPANY_BASE_CURRENCY || 'AED';

if (!connectionString) {
  console.error('DATABASE_URL is required to seed the Neon admin.');
  process.exit(1);
}

if (!adminEmail || !adminPassword) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the first admin.');
  process.exit(1);
}

if (adminPassword.length < 6) {
  console.error('ADMIN_PASSWORD must be at least 6 characters.');
  process.exit(1);
}

const sql = neon(connectionString);
const passwordHash = await bcrypt.hash(adminPassword, 12);

const existingCompany = (await sql`
  select id
  from companies
  where name = ${companyName}
  order by created_at asc
  limit 1
`)[0];

const createdCompany = existingCompany ? null : (await sql`
  insert into companies (name, country_code, base_currency, plan)
  values (${companyName}, ${countryCode}, ${baseCurrency}, 'production')
  returning id
`)[0];

const companyId = existingCompany?.id || createdCompany?.id;

if (!companyId) {
  throw new Error('Unable to create or find the seed company.');
}

await sql`
  insert into app_users (company_id, email, password_hash, full_name, role, super_admin, is_ceo)
  values (${companyId}, ${adminEmail.toLowerCase()}, ${passwordHash}, ${adminName}, 'admin', true, true)
  on conflict (email) do update set
    password_hash = excluded.password_hash,
    full_name = excluded.full_name,
    role = excluded.role,
    super_admin = true,
    is_ceo = true,
    company_id = excluded.company_id,
    updated_at = now()
`;

const defaultCategories = [
  'Travel',
  'Transport',
  'Fuel',
  'Meals',
  'Accommodation',
  'Office',
  'Office Supplies',
  'Repairs',
  'Maintenance',
  'General',
  'Logistics',
  'Other',
];
for (const [sortOrder, category] of defaultCategories.entries()) {
  await sql`
    insert into expense_categories (company_id, name, is_system, sort_order)
    values (${companyId}, ${category}, true, ${sortOrder + 1})
    on conflict (company_id, name) do update set
      is_system = excluded.is_system,
      sort_order = excluded.sort_order,
      updated_at = now()
  `;
}

console.log(`Seeded admin ${adminEmail.toLowerCase()} for company ${companyName}.`);
