import { strict as assert } from "node:assert";
import {
  buildRequestContext,
  captureError,
  resetObservabilitySink,
  sanitizeRecord,
  setObservabilitySink,
  type LogRecord
} from "./index";

const records: LogRecord[] = [];

setObservabilitySink({
  capture(record: LogRecord) {
    records.push(record);
  }
});

const headers = new Headers({
  authorization: "Bearer should-not-log",
  "x-correlation-id": "corr_sample_001",
  "x-tenant-id": "00000000-0000-4000-8000-000000020001",
  "x-user-id": "00000000-0000-4000-8000-000000020002"
});

const context = buildRequestContext({
  app: "customer-portal",
  headers,
  method: "POST",
  path: "/en/crm"
});

await captureError({
  context,
  error: Object.assign(new Error("Sample failure"), { digest: "NEXT_SAMPLE_DIGEST" }),
  metadata: {
    nested: {
      apiKey: "do-not-emit"
    },
    safe: "value",
    service_role_key: "never-emit"
  }
});

assert.equal(records.length, 1);
assert.equal(records[0]?.event, "error.captured");
assert.equal(records[0]?.correlationId, "corr_sample_001");
assert.equal(records[0]?.tenantId, "00000000-0000-4000-8000-000000020001");
assert.equal(records[0]?.userId, "00000000-0000-4000-8000-000000020002");
assert.equal(records[0]?.error?.message, "Sample failure");
assert.equal(records[0]?.error?.digest, "NEXT_SAMPLE_DIGEST");
assert.equal(JSON.stringify(records[0]).includes("do-not-emit"), false);
assert.equal(JSON.stringify(records[0]).includes("never-emit"), false);

const sanitized = sanitizeRecord({
  password: "hidden",
  publicValue: "visible",
  token: "hidden"
});
assert.deepEqual(sanitized, {
  password: "[REDACTED]",
  publicValue: "visible",
  token: "[REDACTED]"
});

resetObservabilitySink();
console.log("Observability tests passed.");
