// One-shot demo tenant seeder. Idempotent. Super-admin only.
// Creates: demo company, 4 auth users + profiles, employees, teams, trips,
// expenses across all statuses, spend policies, budgets, per-diem rates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000d3m";
const DEMO_PASSWORD = "TexDemo!2026";

type Seed = {
  email: string;
  full_name: string;
  role: "admin" | "manager" | "finance" | "employee";
  is_ceo?: boolean;
  manager_email?: string;
  approval_limit_aed?: number;
};

const SEEDS: Seed[] = [
  { email: "demo.ceo@tex-demo.com", full_name: "Alex Carter", role: "admin", is_ceo: true, approval_limit_aed: 100000 },
  { email: "demo.finance@tex-demo.com", full_name: "Priya Shah", role: "finance", approval_limit_aed: 50000 },
  { email: "demo.manager@tex-demo.com", full_name: "Sam Rivera", role: "manager", manager_email: "demo.ceo@tex-demo.com", approval_limit_aed: 10000 },
  { email: "demo.employee@tex-demo.com", full_name: "Jordan Lee", role: "employee", manager_email: "demo.manager@tex-demo.com" },
];

const EMPLOYEES = [
  { name: "Hassan Ali", phone_number: "+971501112201", department: "Sales" },
  { name: "Mei Tanaka", phone_number: "+971501112202", department: "Sales" },
  { name: "Diego Fernandez", phone_number: "+971501112203", department: "Operations" },
  { name: "Aisha Khan", phone_number: "+971501112204", department: "Operations" },
  { name: "Liam O'Brien", phone_number: "+971501112205", department: "Engineering" },
  { name: "Nadia Petrov", phone_number: "+971501112206", department: "Engineering" },
];

const TRIPS = [
  { id: "00000000-0000-0000-0000-000000000t01", name: "Dubai Sales Roadshow", description: "Q2 client meetings across UAE", budget_aed: 25000, status: "open", start_date: daysAgo(30), end_date: daysAgo(5) },
  { id: "00000000-0000-0000-0000-000000000t02", name: "London Trade Show", description: "TechExpo London booth", budget_aed: 60000, status: "open", start_date: daysAgo(60), end_date: daysAgo(50) },
  { id: "00000000-0000-0000-0000-000000000t03", name: "Berlin Customer Visits", description: "EU partner site visits", budget_aed: 45000, status: "closed", start_date: daysAgo(120), end_date: daysAgo(110) },
  { id: "00000000-0000-0000-0000-000000000t04", name: "Cape Town Offsite", description: "Annual team offsite", budget_aed: 80000, status: "open", start_date: daysAgo(20), end_date: daysAgo(10) },
];

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return j({ error: "Unauthorized" }, 401);
    }
    const { data: claims } = await admin.auth.getClaims(auth.replace("Bearer ", ""));
    const callerId = claims?.claims?.sub as string | undefined;
    if (!callerId) return j({ error: "Invalid token" }, 401);
    const { data: caller } = await admin.from("profiles").select("super_admin").eq("id", callerId).single();
    if (!caller?.super_admin) return j({ error: "Forbidden: super admin only" }, 403);

    // 1. Company (use plan='demo' so RLS guardrails kick in)
    await admin.from("companies").upsert({
      id: DEMO_COMPANY_ID,
      name: "TEX Demo Co.",
      country_code: "AE",
      base_currency: "AED",
      plan: "demo",
    }, { onConflict: "id" });

    // 2. Auth users
    const idByEmail: Record<string, string> = {};
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const s of SEEDS) {
      let user = list?.users?.find((u) => u.email?.toLowerCase() === s.email.toLowerCase());
      if (!user) {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: s.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: s.full_name },
        });
        if (error) return j({ error: `create ${s.email}: ${error.message}` }, 500);
        user = created.user!;
      }
      idByEmail[s.email] = user.id;
    }

    // 3. Profiles
    for (const s of SEEDS) {
      const id = idByEmail[s.email];
      const managerId = s.manager_email ? idByEmail[s.manager_email] ?? null : null;
      await admin.from("profiles").update({
        company_id: DEMO_COMPANY_ID,
        full_name: s.full_name,
        role: s.role,
        is_ceo: s.is_ceo ?? false,
        manager_id: managerId,
        approval_limit_aed: s.approval_limit_aed ?? null,
      }).eq("id", id);
    }

    const ceoId = idByEmail["demo.ceo@tex-demo.com"];
    const mgrId = idByEmail["demo.manager@tex-demo.com"];
    const finId = idByEmail["demo.finance@tex-demo.com"];
    const empId = idByEmail["demo.employee@tex-demo.com"];

    // 4. Employees (deterministic ids so re-runs upsert cleanly)
    const empRows = EMPLOYEES.map((e, i) => ({
      id: `00000000-0000-0000-0000-0000000e${(i + 10).toString().padStart(4, "0")}`,
      company_id: DEMO_COMPANY_ID,
      name: e.name,
      phone_number: e.phone_number,
      department: e.department,
      is_active: true,
    }));
    await admin.from("employees").upsert(empRows, { onConflict: "id" });

    // 5. Trips
    const tripRows = TRIPS.map((t) => ({
      id: t.id,
      company_id: DEMO_COMPANY_ID,
      name: t.name,
      description: t.description,
      budget_aed: t.budget_aed,
      start_date: t.start_date,
      end_date: t.end_date,
      status: t.status,
      created_by: ceoId,
    }));
    await admin.from("trips").upsert(tripRows, { onConflict: "id" });

    // 6. Expenses: wipe & reseed (idempotent fresh demo)
    await admin.from("expenses").delete().eq("company_id", DEMO_COMPANY_ID);

    const categories = ["Meals", "Transport", "Accommodation", "Office Supplies", "Client Entertainment", "Software"];
    const vendors = ["Starbucks", "Uber", "Marriott Hotels", "Amazon", "Nobu Dubai", "Notion Labs", "British Airways", "Lufthansa", "Careem", "Carrefour"];
    const currencies: [string, number][] = [["AED", 1], ["USD", 3.67], ["GBP", 4.65], ["EUR", 3.95], ["ZAR", 0.20]];
    const statuses = ["pending", "approved", "rejected", "finance_reviewed", "paid"] as const;
    const submitters = [
      { name: "Jordan Lee", phone: "+971501112200", profile_id: empId },
      ...EMPLOYEES.map((e, i) => ({ name: e.name, phone: e.phone_number, employee_id: empRows[i].id })),
    ];

    const expenses: any[] = [];
    for (let i = 0; i < 60; i++) {
      const cat = pick(categories, i);
      const vendor = pick(vendors, i * 7);
      const [cur, rate] = pick(currencies, Math.floor(i / 5));
      const amount = Math.round((20 + Math.random() * 480) * 100) / 100;
      const status = statuses[i % statuses.length];
      const trip = i % 4 === 0 ? pick(TRIPS, i / 4) : null;
      const sub = pick(submitters, i * 3);
      const created = new Date(); created.setDate(created.getDate() - Math.floor(Math.random() * 90));
      const row: any = {
        company_id: DEMO_COMPANY_ID,
        employee_id: (sub as any).employee_id ?? null,
        employee_name: sub.name,
        employee_phone: sub.phone,
        vendor,
        date: daysAgo(Math.floor(Math.random() * 90)),
        amount,
        currency: cur,
        base_amount: Math.round(amount * rate * 100) / 100,
        exchange_rate: rate,
        category: cat,
        expense_type: "receipt",
        payment_method: i % 3 === 0 ? "Corporate Card" : "Personal Card",
        trip_id: trip?.id ?? null,
        trip_name: trip?.name ?? null,
        notes: i % 5 === 0 ? "Client meeting follow-up" : null,
        status,
        source: i % 6 === 0 ? "whatsapp" : "web",
        policy_flag: i % 11 === 0,
        policy_flag_reason: i % 11 === 0 ? ({
          Meals: "Above daily meal limit",
          Transport: "Above daily transport limit",
          Accommodation: "Above nightly accommodation limit",
          Entertainment: "Requires manager justification",
          Fuel: "Above daily fuel limit",
        } as Record<string, string>)[cat] ?? "Policy threshold exceeded" : null,
        created_at: created.toISOString(),
      };
      if (status === "approved" || status === "finance_reviewed" || status === "paid") {
        row.approved_by = mgrId;
        row.approved_at = new Date(created.getTime() + 86400_000).toISOString();
      }
      if (status === "rejected") {
        row.rejected_by = mgrId;
        row.rejected_at = new Date(created.getTime() + 86400_000).toISOString();
        row.rejected_reason = "Missing itemized receipt";
      }
      if (status === "finance_reviewed" || status === "paid") {
        row.finance_reviewed_by = finId;
        row.finance_reviewed_at = new Date(created.getTime() + 2 * 86400_000).toISOString();
      }
      if (status === "paid") {
        row.paid_by = finId;
        row.paid_at = new Date(created.getTime() + 3 * 86400_000).toISOString();
      }
      expenses.push(row);
    }
    await admin.from("expenses").insert(expenses);

    // 7. Spend policies
    await admin.from("spend_policies").delete().eq("company_id", DEMO_COMPANY_ID);
    await admin.from("spend_policies").insert([
      { company_id: DEMO_COMPANY_ID, category: "Meals", daily_limit: 250, monthly_limit: 3000, requires_notes_above: 200 },
      { company_id: DEMO_COMPANY_ID, category: "Transport", daily_limit: 500, monthly_limit: 5000, requires_notes_above: 300 },
      { company_id: DEMO_COMPANY_ID, category: "Client Entertainment", daily_limit: 1500, monthly_limit: 8000, requires_notes_above: 500 },
    ]);

    // 8. Budgets (current month)
    const now = new Date();
    const m = now.getMonth() + 1, y = now.getFullYear();
    await admin.from("budgets").upsert([
      { company_id: DEMO_COMPANY_ID, department: "Sales", month: m, year: y, budget_amount: 30000 },
      { company_id: DEMO_COMPANY_ID, department: "Operations", month: m, year: y, budget_amount: 18000 },
      { company_id: DEMO_COMPANY_ID, department: "Engineering", month: m, year: y, budget_amount: 22000 },
    ], { onConflict: "company_id,department,month,year" });

    // 9. Per-diem rates
    await admin.from("per_diem_rates").delete().eq("company_id", DEMO_COMPANY_ID);
    await admin.from("per_diem_rates").insert([
      { company_id: DEMO_COMPANY_ID, destination: "London", daily_rate: 400, currency: "GBP" },
      { company_id: DEMO_COMPANY_ID, destination: "Berlin", daily_rate: 350, currency: "EUR" },
      { company_id: DEMO_COMPANY_ID, destination: "Cape Town", daily_rate: 3500, currency: "ZAR" },
    ]);

    return j({
      success: true,
      company_id: DEMO_COMPANY_ID,
      users: idByEmail,
      password: DEMO_PASSWORD,
      expenses_created: expenses.length,
    }, 200);
  } catch (e) {
    return j({ error: (e as Error).message, stack: (e as Error).stack }, 500);
  }
});

function j(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
