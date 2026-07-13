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
      instructions:
        "Extract expense receipt fields for a travel and expense system. Return only fields visible or strongly inferable from the receipt. Do not invent merchant names, dates, amounts, or currencies.",
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
