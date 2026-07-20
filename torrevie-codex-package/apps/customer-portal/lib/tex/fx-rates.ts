import type { TexFxRefreshResult } from "./types";

export async function fetchTexFxRates(
  currencies: readonly string[],
  fetcher: typeof fetch,
  errors: string[]
): Promise<{ source: TexFxRefreshResult["source"]; values: Record<string, number> }> {
  const primaryKey = process.env.FX_API_KEY?.trim();

  if (primaryKey) {
    try {
      const response = await fetcher(
        `https://v6.exchangerate-api.com/v6/${encodeURIComponent(primaryKey)}/latest/USD`
      );
      const body = (await response.json().catch(() => ({}))) as {
        result?: string;
        conversion_rates?: Record<string, number>;
      };

      if (!response.ok || body.result !== "success" || !body.conversion_rates) {
        throw new Error(`Primary FX API returned ${response.status}`);
      }

      return {
        source: "live",
        values: pickFxRates(currencies, body.conversion_rates)
      };
    } catch (error) {
      errors.push(`Primary FX API failed: ${errorMessage(error)}`);
    }
  } else {
    errors.push("FX_API_KEY is not configured.");
  }

  try {
    const response = await fetcher(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
    );
    const body = (await response.json().catch(() => ({}))) as { usd?: Record<string, number> };

    if (!response.ok || !body.usd) {
      throw new Error(`Fallback FX API returned ${response.status}`);
    }

    return {
      source: "fallback",
      values: pickFxRates(
        currencies,
        Object.fromEntries(
          Object.entries(body.usd).map(([key, value]) => [key.toUpperCase(), value])
        )
      )
    };
  } catch (error) {
    errors.push(`Fallback FX API failed: ${errorMessage(error)}`);
  }

  return { source: "none", values: {} };
}

function pickFxRates(currencies: readonly string[], rates: Record<string, number>) {
  return Object.fromEntries(
    currencies
      .map((currency) => [currency, rates[currency]] as const)
      .filter((entry): entry is readonly [string, number] => Number.isFinite(entry[1]))
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
