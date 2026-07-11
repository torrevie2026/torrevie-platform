import { getMessages, isLocale, type Locale } from "@torrevie/localization";
import { notFound } from "next/navigation";

const sampleMembers = [
  {
    name: "Maya Haddad",
    email: "maya.haddad@example.test",
    status: "active",
    role: "Customer Admin"
  },
  {
    name: "Omar Faris",
    email: "omar.faris@example.test",
    status: "invited",
    role: "Customer Manager"
  },
  {
    name: "Leen Salim",
    email: "leen.salim@example.test",
    status: "active",
    role: "Customer Readonly"
  }
] as const;

export default async function CustomerUsersPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const t = getMessages(locale);
  const admin = t.adminUsers;

  return (
    <main className="customer-shell admin-users-shell" data-visual-check="customer-admin-users">
      <aside className="customer-sidebar" aria-label="Customer Portal sections">
        <a className="customer-brand" href={`/${locale}`} aria-label={t.appName}>
          <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
          <span>{t.appName}</span>
        </a>
        <nav>
          <a href={`/${locale}`}>{t.nav.overview}</a>
          <a href={`/${locale}/admin/users`} aria-current="page">
            {t.nav.admin}
          </a>
          <a href={`/${locale}`}>{t.nav.settings}</a>
        </nav>
      </aside>

      <section className="customer-main">
        <header className="customer-topbar">
          <div>
            <p className="eyebrow">{admin.eyebrow}</p>
            <h1>{admin.title}</h1>
            <p>{admin.subtitle}</p>
          </div>
          <div className="customer-context" aria-label="Administration guardrails">
            <span>{admin.requiredRole}: customer_admin</span>
            <span>{admin.tenantScope}: Gulf Demo</span>
            <span>{admin.rlsContext}: tenant only</span>
          </div>
        </header>

        <section className="admin-layout" aria-label="Customer administration">
          <form className="admin-panel" aria-label={admin.inviteUser}>
            <h2>{admin.inviteUser}</h2>
            <label>
              {admin.email}
              <input name="email" type="email" placeholder="user@example.com" dir="ltr" />
            </label>
            <label>
              {admin.displayName}
              <input name="displayName" type="text" placeholder={admin.displayNamePlaceholder} />
            </label>
            <label>
              {admin.role}
              <select name="role" defaultValue="customer_standard_user">
                <option value="customer_admin">Customer Admin</option>
                <option value="customer_module_admin">Module Admin</option>
                <option value="customer_manager">Customer Manager</option>
                <option value="customer_standard_user">Standard User</option>
                <option value="customer_readonly">Readonly</option>
              </select>
            </label>
            <button type="button">{admin.invite}</button>
          </form>

          <section className="admin-panel member-panel" aria-labelledby="members-title">
            <h2 id="members-title">{admin.tenantUsers}</h2>
            <div className="member-table" role="table" aria-label={admin.tenantUsers}>
              <div role="row" className="member-row member-row-head">
                <span role="columnheader">{admin.user}</span>
                <span role="columnheader">{admin.status}</span>
                <span role="columnheader">{admin.role}</span>
                <span role="columnheader">{admin.action}</span>
              </div>
              {sampleMembers.map((member) => (
                <div role="row" className="member-row" key={member.email}>
                  <span role="cell">
                    <strong>{member.name}</strong>
                    <small>{member.email}</small>
                  </span>
                  <span role="cell">
                    <mark>{member.status}</mark>
                  </span>
                  <span role="cell">{member.role}</span>
                  <span role="cell">
                    <button type="button">{admin.update}</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
