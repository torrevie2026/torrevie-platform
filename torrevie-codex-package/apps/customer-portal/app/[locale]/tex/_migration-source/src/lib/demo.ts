import { useAuth } from "@/contexts/AuthContext";

export const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000d3m";

export function useIsDemo() {
  const { profile, selectedCompanyId } = useAuth();
  return (profile?.company_id ?? selectedCompanyId) === DEMO_COMPANY_ID;
}
