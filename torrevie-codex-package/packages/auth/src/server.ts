import { createHash, randomBytes } from "node:crypto";

export type AuthActionType = "invite" | "recovery";

export type CreateAuthActionShortLinkInput = {
  actionLink: string;
  actionType: AuthActionType;
  baseUrl: string;
  expiresInHours?: number;
};

type AuthActionLinkClient = {
  from(table: "auth_action_links"): unknown;
};

type AuthActionLinkTable = {
  insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  select(columns: string): {
    eq(column: string, value: string): {
      maybeSingle(): PromiseLike<{
        data: { action_link?: string; expires_at?: string; access_count?: number } | null;
        error: { message: string } | null;
      }>;
    };
  };
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
  };
};

export async function createAuthActionShortLink(
  client: AuthActionLinkClient,
  input: CreateAuthActionShortLinkInput
) {
  const token = randomBytes(32).toString("base64url");
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const expiresInHours = input.expiresInHours ?? 24;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const table = client.from("auth_action_links") as AuthActionLinkTable;
  const { error } = await table.insert({
    token_hash: hashAuthActionToken(token),
    action_link: input.actionLink,
    action_type: input.actionType,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(`Unable to create Torrevie auth action link: ${error.message}`);
  }

  return `${baseUrl}/auth/a/${encodeURIComponent(token)}`;
}

export async function redeemAuthActionLink(client: AuthActionLinkClient, token: string) {
  const tokenHash = hashAuthActionToken(token);
  const table = client.from("auth_action_links") as AuthActionLinkTable;
  const { data, error } = await table
    .select("action_link,expires_at,access_count")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load Torrevie auth action link: ${error.message}`);
  }

  if (!data?.action_link || !data.expires_at || new Date(data.expires_at).getTime() <= Date.now()) {
    throw new Error("Torrevie auth action link is invalid or expired.");
  }

  await table
    .update({
      access_count: Number(data.access_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString()
    })
    .eq("token_hash", tokenHash);

  return data.action_link as string;
}

export function hashAuthActionToken(token: string) {
  const normalizedToken = token.trim();

  if (normalizedToken.length < 32) {
    throw new Error("Invalid auth action token.");
  }

  return createHash("sha256").update(normalizedToken).digest("hex");
}
