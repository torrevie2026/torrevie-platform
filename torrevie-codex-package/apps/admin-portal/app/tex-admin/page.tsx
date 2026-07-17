import { redirect } from "next/navigation";

export default function TexAdminRedirect() {
  redirect("/subscriptions?section=tex");
}
