import type { Locale } from "@torrevie/localization";
import { signOutCustomerAction } from "./session-actions";

export function CustomerSessionActions({ locale }: { locale: Locale }) {
  return (
    <div className="customer-session-actions">
      <a href={`/${locale}/account`}>Manage my account</a>
      <form action={signOutCustomerAction}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  );
}
