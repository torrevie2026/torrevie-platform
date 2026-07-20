import type { TenantQueryClient } from "@torrevie/tenant-context";

export async function assertTripExists(client: TenantQueryClient, tripId: string) {
  const result = await client.query<{ id: string }>(
    `
      select id
      from public.tex_trips
      where tenant_id = public.current_tenant_id()
        and id = $1
      limit 1
    `,
    [tripId]
  );

  if (result.rows.length !== 1) {
    throw new Error("Unable to find trip.");
  }
}
