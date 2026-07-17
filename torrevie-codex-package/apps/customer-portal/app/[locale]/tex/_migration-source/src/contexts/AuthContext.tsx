import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

export interface AppUser {
  id: string;
  email: string | null;
  user_metadata?: Record<string, unknown>;
}

export interface AppSession {
  access_token: string;
}

export interface Profile {
  id: string;
  company_id: string | null;
  full_name: string | null;
  role: string | null;
  super_admin: boolean | null;
  avatar_url: string | null;
  manager_id: string | null;
  is_ceo: boolean;
  approval_limit_aed: number | null;
}

export interface AccessibleCompany {
  id: string;
  name: string;
  base_currency: string;
  country_code: string;
  logo_url: string | null;
  role: string | null;
  is_default: boolean;
}

interface AuthPayload {
  user: AppUser | null;
  session: AppSession | null;
  profile: Profile | null;
  companies?: AccessibleCompany[];
}

interface AuthContextType extends AuthPayload {
  loading: boolean;
  hasDirectReports: boolean;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const emptyAuth: AuthPayload = {
  user: null,
  session: null,
  profile: null,
  companies: [],
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = 'tex.selectedCompanyId';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthPayload>(emptyAuth);
  const [loading, setLoading] = useState(true);
  const [hasDirectReports] = useState(false);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  const setSelectedCompanyId = (id: string | null) => {
    setSelectedCompanyIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage access errors in restricted browser contexts.
    }
  };

  const applyAuth = (payload: AuthPayload) => {
    const companies = payload.companies || [];
    setAuth({ ...payload, companies });
    setSelectedCompanyIdState((current) => {
      if (current && companies.some((company) => company.id === current)) return current;
      const defaultCompany = companies.find((company) => company.is_default)?.id;
      return defaultCompany || payload.profile?.company_id || companies[0]?.id || null;
    });
  };

  const refreshProfile = async () => {
    const payload = await apiRequest<AuthPayload>('/api/auth/me');
    applyAuth(payload);
  };

  useEffect(() => {
    refreshProfile()
      .catch(() => setAuth(emptyAuth))
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const payload = await apiRequest<AuthPayload>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      applyAuth(payload);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async () => {
    return { error: new Error('Account creation is by invitation only.') };
  };

  const signOut = async () => {
    await apiRequest('/api/auth/signout', { method: 'POST' });
    setAuth(emptyAuth);
    setSelectedCompanyId(null);
  };

  const effectiveCompanyId = selectedCompanyId && (auth.profile?.super_admin || auth.companies?.some((company) => company.id === selectedCompanyId))
    ? selectedCompanyId
    : auth.profile?.company_id ?? auth.companies?.[0]?.id ?? null;

  const publicSetSelectedCompanyId = (id: string | null) => {
    if (id && !auth.profile?.super_admin && !auth.companies?.some((company) => company.id === id)) return;
    setSelectedCompanyId(id);
  };

  return (
    <AuthContext.Provider value={{
      ...auth,
      loading,
      hasDirectReports,
      selectedCompanyId: effectiveCompanyId,
      setSelectedCompanyId: publicSetSelectedCompanyId,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
