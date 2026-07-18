type PreparedReceiptUpload = {
  fileName: string;
  contentType: string;
  dataBase64: string;
};

const MAX_BROWSER_RECEIPT_DATA_URL_LENGTH = 3_800_000;
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function prepareReceiptUpload(file: File): Promise<PreparedReceiptUpload> {
  if (file.type.startsWith("image/") && !isHeic(file)) {
    try {
      const prepared = await prepareImageReceipt(file);
      assertBrowserPayloadSize(prepared.dataBase64);
      return prepared;
    } catch {
      const dataBase64 = await fileToDataUrl(file);
      assertBrowserPayloadSize(dataBase64);
      return {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        dataBase64
      };
    }
  }

  const dataBase64 = await fileToDataUrl(file);
  assertBrowserPayloadSize(dataBase64);
  return {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    dataBase64
  };
}

export async function readTexJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = parseJsonBody(text);

  if (!response.ok) {
    throw new Error(readTexErrorMessage(response, body, text));
  }

  if (body == null) {
    throw new Error("TEX returned an empty response.");
  }

  return body as T;
}

function assertBrowserPayloadSize(dataBase64: string) {
  if (dataBase64.length > MAX_BROWSER_RECEIPT_DATA_URL_LENGTH) {
    throw new Error(
      "Receipt file is too large for browser upload. Please use a smaller image or send it through WhatsApp."
    );
  }
}

async function prepareImageReceipt(file: File): Promise<PreparedReceiptUpload> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare receipt image.");
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  const dataBase64 = await blobToDataUrl(blob);

  return {
    fileName: renameImageAsJpeg(file.name),
    contentType: "image/jpeg",
    dataBase64
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read receipt image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not compress receipt image."));
        }
      },
      type,
      quality
    );
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read receipt file."));
    reader.readAsDataURL(blob);
  });
}

function isHeic(file: File) {
  return /hei[cf]/i.test(file.type) || /\.(hei[cf])$/i.test(file.name);
}

function renameImageAsJpeg(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "receipt"}.jpg`;
}

function parseJsonBody(text: string): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readTexErrorMessage(response: Response, body: unknown, text: string) {
  if (response.status === 413) {
    return "Receipt file is too large for browser upload. Please use a smaller image or send it through WhatsApp.";
  }

  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  if (text.trim() && !text.trim().startsWith("<")) {
    return text.trim().slice(0, 180);
  }

  return `TEX request failed with status ${response.status}.`;
}
