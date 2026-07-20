export function receiptBucketName() {
  return process.env.SUPABASE_RECEIPTS_BUCKET?.trim() || "receipts";
}

export async function uploadReceiptObject(
  storagePath: string,
  contentType: string,
  buffer: Buffer
) {
  const bucket = receiptBucketName();
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const serviceKey = supabaseServiceRoleKey();
  const response = await fetch(
    `${supabaseProjectUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        ...supabaseServiceHeaders(serviceKey),
        "Content-Type": contentType,
        "x-upsert": "false"
      },
      body: buffer
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Receipt storage upload failed: ${response.status} ${text.slice(0, 240)}`);
  }
}

export async function downloadReceiptObject(storagePath: string) {
  const bucket = receiptBucketName();
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const serviceKey = supabaseServiceRoleKey();
  const response = await fetch(
    `${supabaseProjectUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      headers: supabaseServiceHeaders(serviceKey)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Receipt storage download failed: ${response.status} ${text.slice(0, 240)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function supabaseProjectUrl() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  return url.replace(/\/+$/, "");
}

function supabaseServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured on the customer portal Vercel project."
    );
  }

  return key;
}

function supabaseServiceHeaders(key: string) {
  const headers: Record<string, string> = {
    apikey: key
  };

  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}
