import { strict as assert } from "node:assert";
import { extractReceiptWithAI } from "./tex-ai";

async function main() {
  const previousEnv = {
    TEX_RECEIPT_AI_PROVIDER: process.env.TEX_RECEIPT_AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    GOOGLE_AI_KEY: process.env.GOOGLE_AI_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };
  const previousFetch = globalThis.fetch;

  try {
    process.env.TEX_RECEIPT_AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.OPENAI_API_KEY;

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
