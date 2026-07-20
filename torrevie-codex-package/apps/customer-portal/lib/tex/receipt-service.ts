import { randomUUID } from "node:crypto";
import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission, isTexStandardUserOnly } from "./access";
import { writeTexAuditEvent } from "./audit";
import { sanitizeReceiptUpload } from "./expense-input";
import { extensionForContentType } from "./receipt-file";
import { downloadReceiptObject, uploadReceiptObject } from "./receipt-storage";
import { assertUuid, requireSingleRow } from "./shared";
import type {
  TexActorContext,
  TexReceiptDownload,
  TexReceiptFileRecord,
  TexReceiptUploadInput
} from "./types";

export async function uploadTexReceiptFile(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexReceiptUploadInput
): Promise<TexReceiptFileRecord> {
  assertTexPermission(actor, "tex.expense.submit");
  const receipt = sanitizeReceiptUpload(input);
  const fileId = randomUUID();
  const extension = extensionForContentType(receipt.contentType);
  const storagePath = `tenant/${actor.tenantId}/tex/receipts/${fileId}.${extension}`;

  await uploadReceiptObject(storagePath, receipt.contentType, receipt.buffer);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{
      id: string;
      storage_path: string;
      filename: string;
      content_type: string;
      size_bytes: number;
    }>(
      `
        insert into public.files (
          id,
          tenant_id,
          storage_path,
          filename,
          content_type,
          size_bytes,
          uploaded_by,
          created_by,
          updated_by
        )
        values (
          $1,
          public.current_tenant_id(),
          $2,
          $3,
          $4,
          $5,
          $6,
          $6,
          $6
        )
        returning id, storage_path, filename, content_type, size_bytes::int as size_bytes
      `,
      [
        fileId,
        storagePath,
        receipt.fileName,
        receipt.contentType,
        receipt.buffer.length,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "receipt file");

    await writeTexAuditEvent(client, actor, "tex.receipt.uploaded", "file", row.id, {
      filename: row.filename,
      content_type: row.content_type
    });

    return {
      id: row.id,
      storagePath: row.storage_path,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      url: `/api/tex/receipts/${row.id}`
    };
  });
}

export async function getTexReceiptDownload(
  client: TenantQueryClient,
  actor: TexActorContext,
  receiptId: string
): Promise<TexReceiptDownload> {
  assertTexPermission(actor, "tex.expense.read");
  assertUuid(receiptId, "receipt id");
  const scopeToOwnExpenses = isTexStandardUserOnly(actor);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{
      storage_path: string;
      filename: string;
      content_type: string;
      size_bytes: number;
    }>(
      `
        select storage_path, filename, content_type, size_bytes::int as size_bytes
        from public.files
        where tenant_id = public.current_tenant_id()
          and id = $1
          and (
            $2::boolean = false
            or exists (
              select 1
              from public.tex_expenses e
              left join public.tex_employee_profiles ep
                on ep.tenant_id = e.tenant_id
               and ep.id = e.employee_profile_id
              where e.tenant_id = public.current_tenant_id()
                and e.receipt_file_id = public.files.id
                and (e.submitter_user_id = $3 or ep.user_id = $3)
            )
          )
        limit 1
      `,
      [receiptId, scopeToOwnExpenses, actor.userId]
    );
    const row = requireSingleRow(result.rows, "receipt file");
    const buffer = await downloadReceiptObject(row.storage_path);

    return {
      buffer,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes
    };
  });
}
