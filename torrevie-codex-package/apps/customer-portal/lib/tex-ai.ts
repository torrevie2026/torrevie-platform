export type TexReceiptExtraction = {
  vendor: string | null;
  expenseDate: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
  taxAmount: number | null;
  taxIdNumber: string | null;
  confidence: number;
  notes: string | null;
};

type ReceiptAiProvider = "gemini" | "openai";

const receiptExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    vendor: { type: ["string", "null"] },
    expenseDate: { type: ["string", "null"], description: "ISO date in YYYY-MM-DD format if visible." },
    amount: { type: ["number", "null"] },
    currency: { type: ["string", "null"], description: "Three-letter ISO currency code if inferable." },
    category: { type: ["string", "null"] },
    taxAmount: { type: ["number", "null"] },
    taxIdNumber: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    notes: { type: ["string", "null"] }
  },
  required: ["vendor", "expenseDate", "amount", "currency", "category", "taxAmount", "taxIdNumber", "confidence", "notes"]
};

const receiptPrompt =
  "Extract expense receipt fields for a travel and expense system. Return only fields visible or strongly inferable from the receipt. Do not invent merchant names, dates, amounts, or currencies. Return valid JSON only with keys: vendor, expenseDate, amount, currency, category, taxAmount, taxIdNumber, confidence, notes.";

export async function extractReceiptWithAI(mediaUrl: string): Promise<TexReceiptExtraction> {
  const providers = receiptProviderOrder();
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      return provider === "gemini" ? await extractReceiptWithGemini(mediaUrl) : await extractReceiptWithOpenAI(mediaUrl);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${provider} receipt extraction failed.`);
    }
  }

  throw new Error(errors.join(" ") || "No receipt AI provider is configured.");
}

export async function extractReceiptWithOpenAI(mediaUrl: string): Promise<TexReceiptExtraction> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RECEIPT_MODEL?.trim() || "gpt-5.6",
      instructions: receiptPrompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze this receipt image or document and return structured expense data."
            },
            {
              type: "input_image",
              image_url: mediaUrl,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tex_receipt_extraction",
          strict: true,
          schema: receiptExtractionSchema
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI receipt extraction failed: ${response.status} ${text.slice(0, 400)}`);
  }

  const data = (await response.json()) as { output_text?: string; output?: unknown };
  const outputText = typeof data.output_text === "string" ? data.output_text : findOutputText(data.output);

  if (!outputText) {
    throw new Error("OpenAI receipt extraction returned no structured text.");
  }

  return sanitizeExtraction(JSON.parse(outputText) as Partial<TexReceiptExtraction>);
}

export async function extractReceiptWithGemini(mediaUrl: string): Promise<TexReceiptExtraction> {
  const apiKey = geminiApiKey();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const media = await receiptMediaForGemini(mediaUrl);
  const errors: string[] = [];

  for (const model of geminiReceiptModels()) {
    try {
      return await extractReceiptWithGeminiModel(apiKey, model, media);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Gemini receipt extraction failed for ${model}.`);
    }
  }

  throw new Error(errors.join(" "));
}

async function extractReceiptWithGeminiModel(apiKey: string, model: string, media: { mimeType: string; dataBase64: string }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: receiptPrompt },
            {
              inlineData: {
                mimeType: media.mimeType,
                data: media.dataBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini receipt extraction failed with ${model}: ${response.status} ${text.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const outputText = data.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;

  if (!outputText) {
    throw new Error(`Gemini receipt extraction returned no structured text with ${model}.`);
  }

  return sanitizeExtraction(parseJsonObject(outputText));
}

function findOutputText(output: unknown): string {
  if (!Array.isArray(output)) {
    return "";
  }

  for (const item of output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content && typeof content === "object" && "text" in content && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function receiptProviderOrder(): ReceiptAiProvider[] {
  const configured = (process.env.TEX_RECEIPT_AI_PROVIDER || process.env.AI_PROVIDER_PRIMARY_NAME || "").trim().toLowerCase();

  if (configured.includes("openai")) {
    return ["openai", "gemini"];
  }

  if (configured.includes("gemini") || geminiApiKey()) {
    return openAiReceiptFallbackEnabled() ? ["gemini", "openai"] : ["gemini"];
  }

  return ["openai"];
}

function geminiApiKey() {
  const primaryName = process.env.AI_PROVIDER_PRIMARY_NAME?.trim().toLowerCase() ?? "";
  const fallbackName = process.env.AI_PROVIDER_FALLBACK_NAME?.trim().toLowerCase() ?? "";

  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_KEY?.trim() ||
    (primaryName.includes("gemini") || primaryName.includes("google") ? process.env.AI_PROVIDER_PRIMARY_API_KEY?.trim() : "") ||
    (fallbackName.includes("gemini") || fallbackName.includes("google") ? process.env.AI_PROVIDER_FALLBACK_API_KEY?.trim() : "") ||
    ""
  );
}

function openAiReceiptFallbackEnabled() {
  const value = process.env.OPENAI_RECEIPT_FALLBACK_ENABLED ?? process.env.TEX_OPENAI_RECEIPT_FALLBACK;
  return value === "true" || value === "1";
}

function geminiReceiptModels() {
  return uniqueStrings([
    ...splitModelList(process.env.GEMINI_RECEIPT_MODELS),
    ...splitModelList(process.env.GEMINI_RECEIPT_MODEL),
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite"
  ]);
}

function splitModelList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

async function receiptMediaForGemini(mediaUrl: string) {
  const dataUrl = mediaUrl.match(/^data:([^;,]+);base64,(.+)$/);

  if (dataUrl) {
    return { mimeType: dataUrl[1] ?? "image/jpeg", dataBase64: dataUrl[2] ?? "" };
  }

  const response = await fetch(mediaUrl);

  if (!response.ok) {
    throw new Error(`Could not download receipt media for Gemini: ${response.status}`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());

  return { mimeType, dataBase64: buffer.toString("base64") };
}

function parseJsonObject(value: string): Partial<TexReceiptExtraction> {
  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed) as Partial<TexReceiptExtraction>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Receipt extraction returned invalid JSON.");
    }

    return JSON.parse(match[0]) as Partial<TexReceiptExtraction>;
  }
}

function sanitizeExtraction(value: Partial<TexReceiptExtraction>): TexReceiptExtraction {
  return {
    vendor: cleanOptional(value.vendor),
    expenseDate: cleanDate(value.expenseDate),
    amount: cleanPositiveNumber(value.amount),
    currency: cleanCurrency(value.currency),
    category: cleanOptional(value.category),
    taxAmount: cleanNonNegativeNumber(value.taxAmount),
    taxIdNumber: cleanOptional(value.taxIdNumber),
    confidence: clampConfidence(value.confidence),
    notes: cleanOptional(value.notes)
  };
}

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanDate(value: unknown) {
  const clean = cleanOptional(value);
  return clean && /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

function cleanCurrency(value: unknown) {
  const clean = cleanOptional(value)?.toUpperCase() ?? null;
  return clean && /^[A-Z]{3}$/.test(clean) ? clean : null;
}

function cleanPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanNonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function clampConfidence(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
}
