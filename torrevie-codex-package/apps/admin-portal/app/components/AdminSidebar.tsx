const navItems = [
  { href: "/", label: "Overview" },
  { href: "/tenants", label: "Tenants" },
  { href: "/provisioning", label: "Provisioning" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/", label: "Audit" }
];

export function AdminSidebar() {
  return (
    <aside className="admin-sidebar" aria-label="Control Plane sections">
      <a className="brand" href="/" aria-label="Torrevie Admin overview">
        <img src="/brand/torrevie_logo_white.png" alt="" />
        <span>TORREVIE</span>
      </a>
      <nav>
        {navItems.map((item) => (
          <a key={`${item.href}-${item.label}`} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
