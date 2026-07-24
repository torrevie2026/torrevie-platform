import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import { defaultTexPlanContext, type TexActorContext } from "../tex";
import { getTexFirstRunTutorialState } from "./tutorial-service";

const actor: TexActorContext = {
  tenantId: "00000000-0000-4000-8000-000000001001",
  userId: "00000000-0000-4000-8000-000000002001",
  roleScope: "customer",
  roles: ["customer_admin"],
  entitledProducts: ["tex"],
  texPlan: defaultTexPlanContext()
};

class TutorialClient implements TenantQueryClient {
  constructor(private readonly mode: "dismissed" | "missing_column" | "missing_profile" | "new_profile") {}

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    void sql;
    void values;

    if (
      this.mode === "missing_column" &&
      sql.includes("tex_first_run_tutorial_dismissed_at")
    ) {
      const error = new Error('column "tex_first_run_tutorial_dismissed_at" does not exist') as Error & {
        code?: string;
      };
      error.code = "42703";
      throw error;
    }

    if (this.mode === "missing_profile") {
      return { rows: [] };
    }

    if (this.mode === "dismissed") {
      return {
        rows: [
          {
            tex_first_run_tutorial_dismissed_at: "2026-07-23T15:30:00.000Z"
          }
        ] as Row[]
      };
    }

    return {
      rows: [
        {
          tex_first_run_tutorial_dismissed_at: null
        }
      ] as Row[]
    };
  }
}

async function main() {
  {
    const state = await getTexFirstRunTutorialState(new TutorialClient("new_profile"), actor);
    assert.equal(state.shouldShow, true);
    assert.equal(state.dismissedAt, null);
  }

  {
    const state = await getTexFirstRunTutorialState(new TutorialClient("dismissed"), actor);
    assert.equal(state.shouldShow, false);
    assert.equal(state.dismissedAt, "2026-07-23T15:30:00.000Z");
  }

  {
    const state = await getTexFirstRunTutorialState(new TutorialClient("missing_profile"), actor);
    assert.equal(state.shouldShow, true);
    assert.equal(state.dismissedAt, null);
  }

  {
    const state = await getTexFirstRunTutorialState(new TutorialClient("missing_column"), actor);
    assert.equal(state.shouldShow, true);
    assert.equal(state.dismissedAt, null);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
