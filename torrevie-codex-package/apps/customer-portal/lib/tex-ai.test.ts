import { strict as assert } from "node:assert";
import { extractReceiptWithAI, extractReceiptsWithAI, extractReceiptWithOpenAI } from "./tex-ai";

async function main() {
  const previousEnv = {
    TEX_RECEIPT_AI_PROVIDER: process.env.TEX_RECEIPT_AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_RECEIPT_MODEL: process.env.GEMINI_RECEIPT_MODEL,
    GEMINI_RECEIPT_MODELS: process.env.GEMINI_RECEIPT_MODELS,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    GOOGLE_AI_KEY: process.env.GOOGLE_AI_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_RECEIPT_FALLBACK_ENABLED: process.env.OPENAI_RECEIPT_FALLBACK_ENABLED,
    TEX_OPENAI_RECEIPT_FALLBACK: process.env.TEX_OPENAI_RECEIPT_FALLBACK
  };
  const previousFetch = globalThis.fetch;

  try {
    process.env.TEX_RECEIPT_AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_RECEIPT_FALLBACK_ENABLED;
    delete process.env.TEX_OPENAI_RECEIPT_FALLBACK;

    let requestedUrl = "";
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        contents?: Array<{ parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> }>;
      };
      assert.equal(body.contents?.[0]?.parts?.[1]?.inlineData?.mimeType, "image/jpeg");
      assert.equal(body.contents?.[0]?.parts?.[1]?.inlineData?.data, "dGVzdA==");

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      vendor: "Airport Cafe",
                      expenseDate: "2026-07-12",
                      amount: 120,
                      currency: "aed",
                      category: "Meals",
                      taxAmount: 0,
                      taxIdNumber: null,
                      confidence: 0.91,
                      notes: "Lunch"
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const extraction = await extractReceiptWithAI("data:image/jpeg;base64,dGVzdA==");
    assert.match(requestedUrl, /generativelanguage\.googleapis\.com/);
    assert.equal(extraction.vendor, "Airport Cafe");
    assert.equal(extraction.currency, "AED");
    assert.equal(extraction.amount, 120);

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        contents?: Array<{ parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> }>;
      };
      assert.equal(body.contents?.[0]?.parts?.[1]?.inlineData?.mimeType, "application/pdf");
      assert.equal(body.contents?.[0]?.parts?.[1]?.inlineData?.data, "JVBERi0xLjQ=");

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      vendor: "PDF Parking",
                      expenseDate: "2026-07-14",
                      amount: 55,
                      currency: "AED",
                      category: "Parking",
                      taxAmount: 0,
                      taxIdNumber: null,
                      confidence: 0.86,
                      notes: "PDF receipt"
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const pdfExtraction = await extractReceiptWithAI("data:application/pdf;base64,JVBERi0xLjQ=");
    assert.equal(pdfExtraction.vendor, "PDF Parking");
    assert.equal(pdfExtraction.amount, 55);

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        contents?: Array<{ parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> }>;
      };
      assert.match(body.contents?.[0]?.parts?.[0]?.text ?? "", /every distinct expense receipt/i);
      assert.equal(body.contents?.[0]?.parts?.[1]?.inlineData?.mimeType, "application/pdf");

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      multipleReceipts: true,
                      receipts: [
                        {
                          vendor: "Fuel One",
                          expenseDate: "2026-07-14",
                          amount: 80,
                          currency: "AED",
                          category: "Fuel",
                          taxAmount: 3.8,
                          taxIdNumber: "100000000000003",
                          confidence: 0.92,
                          notes: "First receipt"
                        },
                        {
                          vendor: "Parking Two",
                          expenseDate: "2026-07-15",
                          amount: 25,
                          currency: "AED",
                          category: "Parking",
                          taxAmount: 0,
                          taxIdNumber: null,
                          confidence: 0.88,
                          notes: "Second receipt"
                        }
                      ]
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const pdfReceipts = await extractReceiptsWithAI("data:application/pdf;base64,JVBERi0xLjQ=");
    assert.equal(pdfReceipts.length, 2);
    assert.equal(pdfReceipts[0]?.vendor, "Fuel One");
    assert.equal(pdfReceipts[1]?.amount, 25);

    process.env.OPENAI_API_KEY = "test-openai-key";
    await assert.rejects(
      () => extractReceiptWithOpenAI("data:application/pdf;base64,JVBERi0xLjQ="),
      /image inputs only/
    );
    delete process.env.OPENAI_API_KEY;

    process.env.GEMINI_RECEIPT_MODELS = "retired-model, gemini-3.5-flash";
    const requestedModels: string[] = [];
    globalThis.fetch = async (input) => {
      const model = decodeURIComponent(String(input).match(/models\/([^:]+):generateContent/)?.[1] ?? "");
      requestedModels.push(model);

      if (model === "retired-model") {
        return new Response(JSON.stringify({ error: { message: "model unavailable" } }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      vendor: "Fallback Cafe",
                      expenseDate: "2026-07-13",
                      amount: 42,
                      currency: "AED",
                      category: "Meals",
                      taxAmount: 2,
                      taxIdNumber: null,
                      confidence: 0.88,
                      notes: "Fallback model"
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const fallbackExtraction = await extractReceiptWithAI("data:image/jpeg;base64,dGVzdA==");
    assert.deepEqual(requestedModels, ["retired-model", "gemini-3.5-flash"]);
    assert.equal(fallbackExtraction.vendor, "Fallback Cafe");

    process.env.GEMINI_RECEIPT_MODELS = "retired-model";
    process.env.OPENAI_API_KEY = "test-openai-key";
    const noOpenAiRequests: string[] = [];
    globalThis.fetch = async (input) => {
      noOpenAiRequests.push(String(input));
      return new Response(JSON.stringify({ error: { message: "temporary demand spike" } }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    };

    await assert.rejects(() => extractReceiptWithAI("data:image/jpeg;base64,dGVzdA=="), /retired-model/);
    assert.equal(noOpenAiRequests.some((url) => url.includes("api.openai.com")), false);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  console.log("TEX AI provider tests passed.");
}

void main();
