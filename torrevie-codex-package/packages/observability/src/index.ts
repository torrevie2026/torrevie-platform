export type ObservabilityApp = "admin-portal" | "customer-portal";

export type LogLevel = "info" | "warn" | "error";

export type RequestContextInput = {
  app: ObservabilityApp;
  headers: Pick<Headers, "get">;
  method: string;
  path: string;
};

export type ObservabilityContext = {
  app: ObservabilityApp;
  correlationId: string;
  method?: string;
  path?: string;
  tenantId?: string;
  userId?: string;
};

export type ErrorCaptureInput = {
  context: ObservabilityContext;
  error: unknown;
  metadata?: Record<string, unknown>;
};

export type NextRequestErrorRequest = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
};

export type NextRequestErrorContext = {
  routePath?: string;
  routeType?: string;
  routerKind?: string;
};

export type LogRecord = {
  app: ObservabilityApp;
  correlationId: string;
  event: string;
  level: LogLevel;
  timestamp: string;
  durationMs?: number;
  error?: {
    digest?: string;
    message: string;
    name: string;
  };
  metadata?: Record<string, unknown>;
  method?: string;
  path?: string;
  statusCode?: number;
  tenantId?: string;
  userId?: string;
};

export type ObservabilitySink = {
  capture(record: LogRecord): void | Promise<void>;
};

const redactedValue = "[REDACTED]";
const sensitiveKeyPattern = /authorization|cookie|password|secret|token|api[-_]?key|service[-_]?role|access[-_]?token|refresh[-_]?token/i;

let currentSink: ObservabilitySink = {
  capture(record) {
    const serialized = JSON.stringify(record);

    if (record.level === "error") {
      console.error(serialized);
      return;
    }

    console.log(serialized);
  }
};

export function setObservabilitySink(sink: ObservabilitySink) {
  currentSink = sink;
}

export function resetObservabilitySink() {
  currentSink = {
    capture(record) {
      const serialized = JSON.stringify(record);

      if (record.level === "error") {
        console.error(serialized);
        return;
      }

      console.log(serialized);
    }
  };
}

export function buildRequestContext(input: RequestContextInput): ObservabilityContext {
  return {
    app: input.app,
    correlationId: readHeader(input.headers, "x-correlation-id") ?? createCorrelationId(),
    method: input.method,
    path: input.path,
    tenantId: readHeader(input.headers, "x-tenant-id") ?? readHeader(input.headers, "x-torrevie-tenant-id"),
    userId: readHeader(input.headers, "x-user-id") ?? readHeader(input.headers, "x-torrevie-user-id")
  };
}

export async function logRequestStart(context: ObservabilityContext) {
  await emit({
    ...context,
    event: "request.start",
    level: "info"
  });
}

export async function logRequestEnd(
  context: ObservabilityContext,
  result: {
    durationMs: number;
    statusCode: number;
  }
) {
  await emit({
    ...context,
    durationMs: result.durationMs,
    event: "request.end",
    level: result.statusCode >= 500 ? "error" : "info",
    statusCode: result.statusCode
  });
}

export async function captureError(input: ErrorCaptureInput) {
  const normalized = normalizeError(input.error);

  await emit({
    ...input.context,
    error: normalized,
    event: "error.captured",
    level: "error",
    metadata: sanitizeRecord(input.metadata ?? {})
  });
}

export async function logEvent(
  context: ObservabilityContext,
  event: string,
  metadata: Record<string, unknown> = {},
  level: LogLevel = "info"
) {
  await emit({
    ...context,
    event,
    level,
    metadata: sanitizeRecord(metadata)
  });
}

export function createCorrelationId() {
  return globalThis.crypto?.randomUUID?.() ?? `corr_${Date.now().toString(36)}`;
}

export function registerObservability(app: ObservabilityApp) {
  return logEvent(
    {
      app,
      correlationId: "server-startup"
    },
    "observability.registered"
  );
}

export async function captureNextRequestError(input: {
  app: ObservabilityApp;
  context: NextRequestErrorContext;
  error: unknown;
  request: NextRequestErrorRequest;
}) {
  const context: ObservabilityContext = {
    app: input.app,
    correlationId: readRequestHeader(input.request.headers, "x-correlation-id") ?? "unavailable",
    method: input.request.method,
    path: input.request.path,
    tenantId: readRequestHeader(input.request.headers, "x-tenant-id") ?? readRequestHeader(input.request.headers, "x-torrevie-tenant-id"),
    userId: readRequestHeader(input.request.headers, "x-user-id") ?? readRequestHeader(input.request.headers, "x-torrevie-user-id")
  };

  await captureError({
    context,
    error: input.error,
    metadata: {
      route_path: input.context.routePath,
      route_type: input.context.routeType,
      router_kind: input.context.routerKind
    }
  });
}

export function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    clean[key] = sensitiveKeyPattern.test(key) ? redactedValue : sanitizeValue(value);
  }

  return clean;
}

async function emit(record: Omit<LogRecord, "timestamp">) {
  await currentSink.capture({
    ...record,
    timestamp: new Date().toISOString()
  });
}

function readHeader(headers: Pick<Headers, "get">, key: string) {
  const value = headers.get(key)?.trim();
  return value ? value : undefined;
}

function readRequestHeader(headers: Record<string, string | string[] | undefined>, key: string) {
  const value = headers[key] ?? headers[key.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }

  return value?.trim() || undefined;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (typeof value === "object") {
    return sanitizeRecord(value as Record<string, unknown>);
  }

  return value;
}

function normalizeError(error: unknown): LogRecord["error"] {
  if (error instanceof Error) {
    return {
      digest: readDigest(error),
      message: error.message,
      name: error.name
    };
  }

  return {
    digest: readDigest(error),
    message: String(error),
    name: "UnknownError"
  };
}

function readDigest(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return undefined;
  }

  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.trim() ? digest : undefined;
}
