import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  assignCustomerUserRole,
  assignableCustomerRoles,
  getTenantWhatsappSettings,
  inviteCustomerUser,
  listCustomerMembers,
  removeCustomerUser,
  sendCustomerPasswordReset,
  setCustomerMembershipStatus,
  setCustomerInviteEmailDispatcherForTests,
  setCustomerInviteIdentityCreatorForTests,
  setCustomerPasswordResetEmailDispatcherForTests,
  setCustomerPasswordResetLinkCreatorForTests,
  setCustomerUserMfaRequirement,
  updateTenantWhatsappSettings,
  type CustomerAdminContext
} from "./customer-administration";

const adminContext: CustomerAdminContext = {
  tenantId: "00000000-0000-4000-8000-000000000101",
  userId: "00000000-0000-4000-8000-000000000201",
  roleScope: "customer",
  roles: ["customer_admin"]
};

const standardContext: CustomerAdminContext = {
  ...adminContext,
  userId: "00000000-0000-4000-8000-000000000202",
  roles: ["customer_standard_user"]
};

class RecordingTenantClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  constructor(
    private readonly memberRows: unknown[] = [],
    private readonly options: {
      existingPlatformUserId?: string;
      existingPlatformMembershipCount?: number;
      fsmEntitlementRows?: unknown[];
      fsmSeatUsageCount?: number;
    } = {}
  ) {}

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });

    if (sql.includes("from public.get_org_entitlements")) {
      return { rows: (this.options.fsmEntitlementRows ?? []) as Row[] };
    }

    if (sql.includes("count(distinct tm.user_id)")) {
      return { rows: [{ count: this.options.fsmSeatUsageCount ?? 0 }] as Row[] };
    }

    if (sql.includes("from public.roles")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000901" }] as Row[] };
    }

    if (sql.includes("from public.tenants")) {
      return { rows: [{ name: "Demo Tenant" }] as Row[] };
    }

    if (sql.includes("from public.tenant_memberships") && sql.includes("join public.users")) {
      return { rows: this.memberRows as Row[] };
    }

    if (sql.includes("from public.tenant_memberships") && sql.includes("where user_id = $1")) {
      return { rows: [{ count: this.options.existingPlatformMembershipCount ?? 0 }] as Row[] };
    }

    if (sql.includes("from public.tenant_memberships") || sql.includes("update public.tenant_memberships")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000801" }] as Row[] };
    }

    if (sql.includes("from public.tex_integration_settings")) {
      return {
        rows: [
          {
            whatsapp_provider: "wappfly",
            whatsapp_instance_id: "instance-1",
            wappfly_session_id: "session-1",
            meta_phone_number_id: null,
            meta_whatsapp_business_account_id: null,
            google_maps_enabled: true,
            whatsapp_webhook_url: "https://app.torrevie.com/api/tex/webhook",
            whatsapp_webhook_verify_token_last4: "tokn",
            whatsapp_api_key_last4: "1234",
            whatsapp_app_secret_last4: null,
            whatsapp_keys_configured: true
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_integration_settings")) {
      return {
        rows: [
          {
            whatsapp_provider: values[0],
            whatsapp_instance_id: values[1],
            wappfly_session_id: values[2],
            meta_phone_number_id: values[3],
            meta_whatsapp_business_account_id: values[4],
            google_maps_enabled: values[5],
            whatsapp_webhook_url: values[6],
            whatsapp_api_key_last4: values[7],
            whatsapp_app_secret_last4: values[8],
            whatsapp_webhook_verify_token_last4: values[9],
            whatsapp_keys_configured: values[10]
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.users")) {
      return { rows: [{ id: values[0] }] as Row[] };
    }

    if (sql.includes("from public.users") && sql.includes("lower(email) = $1")) {
      return {
        rows: this.options.existingPlatformUserId
          ? [{ id: this.options.existingPlatformUserId, status: null }]
          : []
      } as QueryResult<Row>;
    }

    if (sql.includes("from public.users") && sql.includes("where id = $1")) {
      return { rows: [{ email: "member@example.test" }] as Row[] };
    }

    if (sql.includes("insert into public.user_profiles")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000701" }] as Row[] };
    }

    if (sql.includes("delete from public.user_role_assignments") || sql.includes("delete from public.user_profiles")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000801" }] as Row[] };
    }

    return { rows: [] };
  }

  hasSql(fragment: string) {
    return this.calls.some((call) => call.sql.includes(fragment));
  }

  valuesContain(value: QueryValue) {
    return this.calls.some((call) => call.values.includes(value));
  }
}

async function main() {
  assert.deepEqual(assignableCustomerRoles.includes("customer_admin"), true);
  assert.deepEqual(assignableCustomerRoles.includes("integration_service"), false);
  assert.deepEqual(assignableCustomerRoles.includes("torrevie_platform_admin"), false);

  {
    const client = new RecordingTenantClient();
    const emails: Array<{ email: string; tenantName: string; actionLink: string; kind: string }> = [];
    setCustomerInviteIdentityCreatorForTests(async () => ({
      userId: "00000000-0000-4000-8000-000000000333",
      actionLink: "https://app.torrevie.com/invite",
      kind: "new_invitation"
    }));
    setCustomerInviteEmailDispatcherForTests(async (input) => {
      emails.push(input);
    });

    try {
      const invited = await inviteCustomerUser(client, adminContext, {
        email: " New.User@Example.TEST ",
        displayName: "New User",
        role: "customer_manager"
      });

      assert.equal(invited.userId, "00000000-0000-4000-8000-000000000333");
      assert.equal(invited.email, "new.user@example.test");
      assert.equal(invited.status, "invited");
      assert.deepEqual(invited.roles, ["customer_manager"]);
      assert.equal(client.hasSql("app.current_tenant_id"), true);
      assert.equal(client.hasSql("app.platform_service_role', 'true"), true);
      assert.equal(client.hasSql("public.tenant_memberships"), true);
      assert.equal(client.hasSql("public.user_role_assignments"), true);
      assert.equal(client.hasSql("public.audit_events"), true);
      assert.equal(client.valuesContain(adminContext.tenantId), true);
      assert.equal(client.valuesContain("00000000-0000-4000-8000-000000000333"), true);
      assert.deepEqual(emails, [
        {
          email: "new.user@example.test",
          tenantName: "Demo Tenant",
          actionLink: "https://app.torrevie.com/invite",
          kind: "new_invitation"
        }
      ]);
    } finally {
      setCustomerInviteIdentityCreatorForTests(null);
      setCustomerInviteEmailDispatcherForTests(null);
    }
  }

  {
    const staleUserId = "00000000-0000-4000-8000-000000000444";
    const newAuthUserId = "00000000-0000-4000-8000-000000000445";
    const client = new RecordingTenantClient([], {
      existingPlatformUserId: staleUserId,
      existingPlatformMembershipCount: 0
    });
    setCustomerInviteIdentityCreatorForTests(async () => ({
      userId: newAuthUserId,
      actionLink: "https://app.torrevie.com/invite",
      kind: "new_invitation"
    }));
    setCustomerInviteEmailDispatcherForTests(async () => {});

    try {
      const invited = await inviteCustomerUser(client, adminContext, {
        email: "removed.user@example.test",
        displayName: "Removed User",
        role: "customer_manager"
      });

      assert.equal(invited.userId, newAuthUserId);
      assert.equal(client.hasSql("set email = $2"), true);
      assert.equal(client.valuesContain(staleUserId), true);
      assert.equal(client.valuesContain("deleted+00000000000040008000000000000444@torrevie.local"), true);
      assert.equal(client.valuesContain(newAuthUserId), true);
    } finally {
      setCustomerInviteIdentityCreatorForTests(null);
      setCustomerInviteEmailDispatcherForTests(null);
    }
  }

  {
    const client = new RecordingTenantClient([], {
      existingPlatformUserId: "00000000-0000-4000-8000-000000000444",
      existingPlatformMembershipCount: 1
    });
    setCustomerInviteIdentityCreatorForTests(async () => ({
      userId: "00000000-0000-4000-8000-000000000445",
      actionLink: "https://app.torrevie.com/invite",
      kind: "new_invitation"
    }));
    setCustomerInviteEmailDispatcherForTests(async () => {});

    try {
      await assert.rejects(
        () =>
          inviteCustomerUser(client, adminContext, {
            email: "member-in-another-tenant@example.test",
            role: "customer_manager"
          }),
        /already linked to another Torrevie user/
      );
    } finally {
      setCustomerInviteIdentityCreatorForTests(null);
      setCustomerInviteEmailDispatcherForTests(null);
    }
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () =>
        inviteCustomerUser(client, standardContext, {
          email: "blocked@example.test",
          role: "customer_readonly"
        }),
      /Permission denied for tenant.user.invite/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () =>
        inviteCustomerUser(client, adminContext, {
          email: "platform-role@example.test",
          role: "torrevie_platform_admin"
        }),
      /Role cannot be assigned/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient([], {
      fsmEntitlementRows: [{ feature_key: "fsm.users.office.max", limit_value: 1 }],
      fsmSeatUsageCount: 1
    });
    await assert.rejects(
      () =>
        inviteCustomerUser(client, adminContext, {
          email: "office-limit@example.test",
          role: "customer_manager"
        }),
      /FSM office user limit of 1/
    );
    assert.equal(client.hasSql("public.get_org_entitlements"), true);
    assert.equal(client.hasSql("count(distinct tm.user_id)"), true);
  }

  {
    const client = new RecordingTenantClient();
    const settings = await getTenantWhatsappSettings(client, adminContext);

    assert.equal(settings.provider, "wappfly");
    assert.equal(settings.webhookUrl, "https://app.torrevie.com/api/tex/webhook");
    assert.equal(settings.apiKeyConfigured, true);
    assert.equal(settings.apiKeyLast4, "1234");
  }

  {
    const client = new RecordingTenantClient();
    const settings = await updateTenantWhatsappSettings(client, adminContext, {
      provider: "meta",
      webhookUrl: "https://app.torrevie.com/api/tex/webhook",
      whatsappInstanceId: "",
      wappflySessionId: "",
      metaPhoneNumberId: "phone-1",
      metaWhatsappBusinessAccountId: "business-1",
      googleMapsEnabled: true,
      apiKey: "api-secret-1234",
      appSecret: "app-secret-9999",
      webhookVerifyToken: "verify-token-0000"
    });

    assert.equal(settings.provider, "meta");
    assert.equal(settings.apiKeyLast4, "1234");
    assert.equal(settings.appSecretLast4, "9999");
    assert.equal(settings.webhookVerifyTokenLast4, "0000");
    assert.equal(client.hasSql("delete from public.tenant_integration_secrets"), true);
    assert.equal(client.hasSql("insert into public.tenant_integration_secrets"), true);
    assert.equal(client.valuesContain("api_key"), true);
    assert.equal(client.valuesContain("tenant.integration.whatsapp.updated"), true);
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () =>
        updateTenantWhatsappSettings(client, adminContext, {
          provider: "ultramsg",
          webhookUrl: "http://app.torrevie.com/api/tex/webhook",
          googleMapsEnabled: false
        }),
      /Webhook URL must be a valid HTTPS URL/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () =>
        updateTenantWhatsappSettings(client, standardContext, {
          provider: "ultramsg",
          webhookUrl: "https://app.torrevie.com/api/tex/webhook",
          googleMapsEnabled: false
        }),
      /Permission denied for tenant.settings.manage/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient();
    await assignCustomerUserRole(
      client,
      adminContext,
      "00000000-0000-4000-8000-000000000301",
      "customer_readonly"
    );
    assert.equal(client.hasSql("delete from public.user_role_assignments"), true);
    assert.equal(client.valuesContain("tenant.role.assigned"), true);
  }

  {
    const client = new RecordingTenantClient();
    await setCustomerMembershipStatus(
      client,
      adminContext,
      "00000000-0000-4000-8000-000000000301",
      "disabled"
    );
    assert.equal(client.hasSql("update public.tenant_memberships"), true);
    assert.equal(client.valuesContain("tenant.user.disabled"), true);
  }

  {
    const client = new RecordingTenantClient();
    await setCustomerUserMfaRequirement(
      client,
      adminContext,
      "00000000-0000-4000-8000-000000000301",
      true
    );
    assert.equal(client.hasSql("require_mfa"), true);
    assert.equal(client.valuesContain(true), true);
    assert.equal(client.valuesContain("tenant.user.mfa_requirement_updated"), true);
  }

  {
    const client = new RecordingTenantClient();
    const passwordResetEmails: Array<{ email: string; tenantName: string; actionLink: string }> = [];
    setCustomerPasswordResetLinkCreatorForTests(async () => "https://app.torrevie.com/reset");
    setCustomerPasswordResetEmailDispatcherForTests(async (input) => {
      passwordResetEmails.push(input);
    });

    try {
      await sendCustomerPasswordReset(
        client,
        adminContext,
        "00000000-0000-4000-8000-000000000301"
      );
      assert.equal(client.hasSql("require_password_change"), true);
      assert.equal(client.valuesContain("tenant.user.password_reset_sent"), true);
      assert.deepEqual(passwordResetEmails, [
        {
          email: "member@example.test",
          tenantName: "Demo Tenant",
          actionLink: "https://app.torrevie.com/reset"
        }
      ]);
    } finally {
      setCustomerPasswordResetLinkCreatorForTests(null);
      setCustomerPasswordResetEmailDispatcherForTests(null);
    }
  }

  {
    const client = new RecordingTenantClient();
    await removeCustomerUser(
      client,
      adminContext,
      "00000000-0000-4000-8000-000000000301"
    );
    assert.equal(client.hasSql("delete from public.user_role_assignments"), true);
    assert.equal(client.hasSql("delete from public.user_profiles"), true);
    assert.equal(client.hasSql("delete from public.tenant_memberships"), true);
    assert.equal(client.valuesContain("tenant.user.removed"), true);
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () => setCustomerMembershipStatus(client, adminContext, adminContext.userId, "disabled"),
      /cannot disable their own/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient([
      {
        user_id: "00000000-0000-4000-8000-000000000401",
        email: "member@example.test",
        display_name: "Member",
        status: "active",
        role_key: "customer_admin",
        require_mfa: true,
        mfa_enrolled: false
      },
      {
        user_id: "00000000-0000-4000-8000-000000000401",
        email: "member@example.test",
        display_name: "Member",
        status: "active",
        role_key: "customer_manager",
        require_mfa: true,
        mfa_enrolled: false
      }
    ]);
    const members = await listCustomerMembers(client, adminContext);
    assert.deepEqual(members, [
      {
        userId: "00000000-0000-4000-8000-000000000401",
        email: "member@example.test",
        displayName: "Member",
        status: "active",
        roles: ["customer_admin", "customer_manager"],
        requireMfa: true,
        mfaEnrolled: false
      }
    ]);
  }

  console.log("Customer administration tests passed.");
}

void main();
