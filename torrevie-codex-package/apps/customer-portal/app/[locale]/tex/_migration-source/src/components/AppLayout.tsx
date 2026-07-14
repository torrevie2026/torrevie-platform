import React, { useEffect, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutGrid, PlusCircle, Receipt, MapPin, Users, BarChart3,
  Settings, Shield, LogOut, Menu, X, ClipboardCheck, UsersRound, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import OfflineIndicator from '@/components/OfflineIndicator';
import NotificationBell from '@/components/NotificationBell';
import DemoBanner from '@/components/DemoBanner';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  show: (ctx: { role: string | null; isAdmin: boolean; isSuperAdmin: boolean; isFinance: boolean; isCoordinator: boolean; hasDirectReports: boolean }) => boolean;
  isPrimary?: boolean;
  badgeKey?: string;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutGrid, show: () => true },
  { title: 'My Team', url: '/my-team', icon: UsersRound, show: ({ hasDirectReports, isAdmin }) => hasDirectReports || isAdmin },
  { title: 'Finance Review', url: '/finance-review', icon: ClipboardCheck, show: ({ isFinance, isAdmin, isSuperAdmin }) => isFinance || isAdmin || isSuperAdmin },
  { title: 'New Expense', url: '/expenses/new', icon: PlusCircle, show: () => true, isPrimary: true },
  { title: 'My Expenses', url: '/expenses', icon: Receipt, show: () => true },
  { title: 'Trips', url: '/trips', icon: MapPin, show: ({ hasDirectReports, isAdmin, isSuperAdmin, isCoordinator }) => hasDirectReports || isAdmin || isSuperAdmin || isCoordinator },
  { title: 'People', url: '/employees', icon: Users, show: ({ isAdmin, isSuperAdmin }) => isAdmin || isSuperAdmin },
  { title: 'Reports', url: '/reports', icon: BarChart3, show: ({ isFinance, isAdmin, isSuperAdmin }) => isFinance || isAdmin || isSuperAdmin },
  { title: 'Settings', url: '/settings', icon: Settings, show: ({ isFinance, isAdmin, isSuperAdmin }) => isFinance || isAdmin || isSuperAdmin },
  { title: 'Privacy', url: '/privacy', icon: FileText, show: () => true },
];

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, companies: accessibleCompanies = [], signOut, selectedCompanyId, setSelectedCompanyId, hasDirectReports } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingTeamCount, setPendingTeamCount] = useState(0);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isSuperAdmin = profile?.super_admin === true;
  const isFinance = profile?.role === 'finance';
  const isCoordinator = profile?.role === 'coordinator';

  // Fetch company name + logo for display
  useEffect(() => {
    if (!selectedCompanyId) { setCompanyName(null); setCompanyLogoUrl(null); return; }
    const company = accessibleCompanies.find((item) => item.id === selectedCompanyId);
    setCompanyName(company?.name ?? null);
    if (company?.logo_url) {
      supabase.storage.from('company-logos').createSignedUrl(company.logo_url, 60 * 60).then(({ data: signed }) => {
        setCompanyLogoUrl(signed?.signedUrl ?? null);
      });
    } else {
      setCompanyLogoUrl(null);
    }
  }, [accessibleCompanies, selectedCompanyId]);

  // Fetch pending count for My Team badge
  useEffect(() => {
    if (!hasDirectReports && !isAdmin) return;
    if (!selectedCompanyId) return;
    supabase.from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', selectedCompanyId)
      .eq('status', 'pending')
      .then(({ count }) => setPendingTeamCount(count ?? 0));
  }, [hasDirectReports, isAdmin, selectedCompanyId]);

  const ctx = { role: profile?.role ?? null, isAdmin: !!isAdmin, isSuperAdmin, isFinance: !!isFinance, isCoordinator, hasDirectReports };
  const visibleItems = navItems.filter(item => item.show(ctx));

  const isActive = (url: string) => {
    if (url === '/expenses/new') return location.pathname === url;
    if (url === '/expenses') return location.pathname === '/expenses';
    return location.pathname.startsWith(url);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const SidebarContent = () => (
    <>
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <img src="/torrevie-logo.png" alt="Torrevie" className="h-9 w-auto flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sidebar-foreground text-lg font-bold leading-tight">Torrevie TEX</h1>
            <p className="text-sidebar-foreground/60 text-xs">The Optimized Way</p>
          </div>
        </div>
        {(companyName || companyLogoUrl) && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2">
            {companyLogoUrl && (
              <img src={companyLogoUrl} alt={companyName ?? 'Company logo'} className="h-7 w-7 rounded object-contain bg-white p-0.5" />
            )}
            <p className="text-sidebar-foreground/70 text-xs truncate">{companyName ?? 'Company workspace'}</p>
          </div>
        )}
      </div>

      {accessibleCompanies.length > 1 && (
        <div className="px-3 pb-3">
          <Select value={selectedCompanyId || ''} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="bg-sidebar-accent/40 border-sidebar-border text-sidebar-foreground rounded-md text-sm">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {accessibleCompanies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <nav className="flex-1 px-3 space-y-1">
        {visibleItems.map(item => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                item.isPrimary && !active && 'text-sidebar-foreground'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span>{item.title}</span>
              {item.url === '/my-team' && pendingTeamCount > 0 && (
                <Badge className="ml-auto h-5 min-w-[20px] rounded-full px-1.5 text-[10px] bg-amber-500 text-white border-0">
                  {pendingTeamCount}
                </Badge>
              )}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <Link
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive('/admin')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
              )}
            >
              <Shield className="h-5 w-5 flex-shrink-0" />
              <span>Admin Panel</span>
            </Link>
          </>
        )}
      </nav>

      <div className="px-3 pb-4 mt-auto">
        <div className="px-3 pb-2 flex items-center justify-end gap-2">
          <OfflineIndicator />
          <div className="hidden md:block">
            <NotificationBell side="right" />
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground/70 text-sm">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground text-xs font-semibold">
            {(profile?.full_name || '?')[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sidebar-foreground text-sm font-medium">{profile?.full_name || 'User'}</p>
            <p className="truncate text-xs capitalize">{profile?.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 mt-1"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex w-full">
      <aside className="hidden md:flex md:w-64 md:flex-col bg-sidebar border-r border-sidebar-border flex-shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="flex flex-col h-full">
          <SidebarContent />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar z-50 flex flex-col border-r border-sidebar-border">
            <div className="absolute top-4 right-4">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="text-sidebar-foreground">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <DemoBanner />
        <header className="md:hidden flex items-center justify-between h-14 border-b bg-card px-4">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="ml-3 flex items-center gap-2">
              <img src="/torrevie-logo.png" alt="Torrevie" className="h-7 w-auto" />
              <span className="font-semibold text-foreground">TEX</span>
            </div>
          </div>
          <NotificationBell side="bottom" />
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
          <footer className="mt-8 pb-20 md:pb-4 text-center text-xs text-muted-foreground">
            Powered by{' '}
            <a href="https://torrevie.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Torrevie
            </a>
          </footer>
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t flex justify-around py-2 z-40">
          {[
            { title: 'Dashboard', url: '/dashboard', icon: LayoutGrid },
            hasDirectReports || isAdmin ? { title: 'My Team', url: '/my-team', icon: UsersRound } : null,
            { title: 'New', url: '/expenses/new', icon: PlusCircle },
            { title: 'Expenses', url: '/expenses', icon: Receipt },
            isFinance || isAdmin
              ? { title: 'Finance', url: '/finance-review', icon: ClipboardCheck }
              : (isCoordinator || hasDirectReports || isSuperAdmin ? { title: 'Trips', url: '/trips', icon: MapPin } : null),
          ].filter(Boolean).map(item => {
            if (!item) return null;
            const active = isActive(item.url);
            return (
              <Link
                key={item.url}
                to={item.url}
                className={cn(
                  'flex flex-col items-center gap-0.5 text-xs px-2 py-1',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default AppLayout;
