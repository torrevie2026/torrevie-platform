export function cleanContentType(value: string) {
  return value.trim().toLowerCase().split(";")[0]?.trim() ?? "";
}

export function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  if (contentType === "application/pdf") return "pdf";
  return "jpg";
}

export function isAllowedReceiptType(contentType: string) {
  return [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf"
  ].includes(contentType);
}

export function isOcrSupportedReceiptType(contentType: string) {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}

export function receiptBufferFromBase64(value: string) {
  const base64 = stripDataUrl(value);
  if (!base64) {
    throw new Error("Receipt data is required.");
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length <= 0) {
    throw new Error("Receipt file is empty.");
  }

  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Receipt file exceeds 20MB.");
  }

  return buffer;
}

export function sanitizeFileName(value: string) {
  const name = value
    .trim()
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 160);
  return name || "receipt";
}

function stripDataUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.includes(",") ? (trimmed.split(",").pop()?.trim() ?? "") : trimmed;
}
