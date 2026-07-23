import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { writeTexAuditEvent } from "./audit";
import type { TexActorContext, TexFirstRunTutorialState } from "./types";

type TutorialProfileRow = {
  tex_first_run_tutorial_dismissed_at: string | null;
};

export async function getTexFirstRunTutorialState(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexFirstRunTutorialState> {
  return withTenantContext(client, actor, async () => {
    try {
      const result = await client.query<TutorialProfileRow>(
        `
          select tex_first_run_tutorial_dismissed_at::text as tex_first_run_tutorial_dismissed_at
            from public.user_profiles
           where tenant_id = public.current_tenant_id()
             and user_id = $1
           limit 1
        `,
        [actor.userId]
      );
      const dismissedAt = result.rows[0]?.tex_first_run_tutorial_dismissed_at ?? null;

      return {
        dismissedAt,
        shouldShow: Boolean(result.rows[0]) && !dismissedAt
      };
    } catch (error) {
      if (isMissingTutorialColumn(error)) {
        return { dismissedAt: null, shouldShow: false };
      }

      throw error;
    }
  });
}

export async function dismissTexFirstRunTutorial(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexFirstRunTutorialState> {
  return withTenantContext(client, actor, async () => {
    try {
      const result = await client.query<TutorialProfileRow>(
        `
          update public.user_profiles
             set tex_first_run_tutorial_dismissed_at = coalesce(
                   tex_first_run_tutorial_dismissed_at,
                   now()
                 ),
                 updated_by = $1,
                 updated_at = now()
           where tenant_id = public.current_tenant_id()
             and user_id = $1
         returning tex_first_run_tutorial_dismissed_at::text as tex_first_run_tutorial_dismissed_at
        `,
        [actor.userId]
      );
      const dismissedAt =
        result.rows[0]?.tex_first_run_tutorial_dismissed_at ?? new Date().toISOString();

      if (result.rows[0]) {
        await writeTexAuditEvent(
          client,
          actor,
          "tex.tutorial.dismissed",
          "user_profiles",
          actor.userId,
          {}
        );
      }

      return { dismissedAt, shouldShow: false };
    } catch (error) {
      if (isMissingTutorialColumn(error)) {
        return { dismissedAt: null, shouldShow: false };
      }

      throw error;
    }
  });
}

function isMissingTutorialColumn(error: unknown) {
  const code = typeof error === "object" && error ? (error as { code?: unknown }).code : null;
  const message = error instanceof Error ? error.message : "";

  return code === "42703" || message.includes("tex_first_run_tutorial_dismissed_at");
}
