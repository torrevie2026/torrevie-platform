import type { Instrumentation } from "next";
import { captureNextRequestError, registerObservability } from "@torrevie/observability/next";

export function register() {
  void registerObservability("customer-portal");
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await captureNextRequestError({
    app: "customer-portal",
    context,
    error,
    request
  });
};
