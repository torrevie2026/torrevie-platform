import { cleanOptional, parseIsoDate } from "./shared";
import type { TexTripInput, TexTripLegInput, TexTripLegMode, TexTripLegStatus } from "./types";
import { optionalInteger, optionalNonNegative, optionalNumber } from "./validation";

export function sanitizeTrip(input: TexTripInput): Required<TexTripInput> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Trip name is required.");
  }

  const tripType = input.tripType === "logistics" ? "logistics" : "general";
  const budgetAmount = optionalNonNegative(input.budgetAmount, "budget amount");
  const driverTripAmount = optionalNonNegative(input.driverTripAmount, "driver trip amount") ?? 0;
  const subcontractorAmount =
    optionalNonNegative(input.subcontractorAmount, "subcontractor amount") ?? 0;
  const enforceCurrency = Boolean(input.enforceCurrency);
  const enforcedCurrency = cleanOptional(input.enforcedCurrency)?.toUpperCase() ?? null;

  if (enforceCurrency && (!enforcedCurrency || !/^[A-Z]{3}$/.test(enforcedCurrency))) {
    throw new Error("Enforced currency must be a three-letter ISO code.");
  }

  return {
    name,
    description: cleanOptional(input.description),
    tripType,
    origin: cleanOptional(input.origin),
    destination: cleanOptional(input.destination),
    budgetAmount,
    advanceDepositFileId: cleanOptional(input.advanceDepositFileId),
    startDate: input.startDate ? parseIsoDate(input.startDate, "start date") : null,
    endDate: input.endDate ? parseIsoDate(input.endDate, "end date") : null,
    enforceCurrency,
    enforcedCurrency: enforceCurrency ? enforcedCurrency : null,
    teamId: cleanOptional(input.teamId),
    containerNumber: cleanOptional(input.containerNumber),
    driverEmployeeProfileId: cleanOptional(input.driverEmployeeProfileId),
    driverTripAmount,
    subcontractorDriverName: cleanOptional(input.subcontractorDriverName),
    subcontractorAmount,
    subcontractorNotes: cleanOptional(input.subcontractorNotes)
  };
}

export function sanitizeTripLegs(input: TexTripLegInput[]): Required<TexTripLegInput>[] {
  return input.map((leg, index) => sanitizeTripLeg(leg, index + 1));
}

export function tripValues(trip: Required<TexTripInput>, userId: string) {
  return [
    trip.name,
    trip.description,
    trip.tripType,
    trip.origin,
    trip.destination,
    trip.budgetAmount,
    trip.advanceDepositFileId,
    trip.startDate,
    trip.endDate,
    trip.enforceCurrency,
    trip.enforcedCurrency,
    trip.teamId,
    trip.containerNumber,
    trip.driverEmployeeProfileId,
    trip.driverTripAmount,
    trip.subcontractorDriverName,
    trip.subcontractorAmount,
    trip.subcontractorNotes,
    userId
  ];
}

export function tripLegValues(leg: Required<TexTripLegInput>) {
  return [
    leg.sequence,
    leg.origin,
    leg.originPlaceId,
    leg.originLat,
    leg.originLng,
    leg.originCountry,
    leg.destination,
    leg.destinationPlaceId,
    leg.destinationLat,
    leg.destinationLng,
    leg.destinationCountry,
    leg.mode,
    leg.status,
    leg.plannedStart,
    leg.plannedEnd,
    leg.actualStart,
    leg.actualEnd,
    leg.distanceKm,
    leg.isReturnTrip,
    leg.returnDistanceKm,
    leg.returnDurationSeconds,
    leg.totalDistanceKm,
    leg.durationSeconds,
    leg.distanceSource,
    leg.routePolyline,
    leg.budgetAmount,
    leg.containerRef,
    leg.notes
  ];
}

function sanitizeTripLeg(
  input: TexTripLegInput,
  fallbackSequence: number
): Required<TexTripLegInput> {
  const origin = input.origin.trim();
  const destination = input.destination.trim();

  if (!origin || !destination) {
    throw new Error("Every trip leg needs an origin and destination.");
  }

  const sequence = Number(input.sequence ?? fallbackSequence);

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Trip leg sequence must be a positive integer.");
  }

  const mode = sanitizeTripLegMode(input.mode);
  const status = sanitizeTripLegStatus(input.status);
  const distanceKm = optionalNonNegative(input.distanceKm, "leg distance");
  const returnDistanceKm = optionalNonNegative(input.returnDistanceKm, "leg return distance");
  const totalDistanceKm =
    optionalNonNegative(input.totalDistanceKm, "leg total distance") ??
    (distanceKm === null
      ? null
      : input.isReturnTrip
        ? distanceKm + (returnDistanceKm ?? distanceKm)
        : distanceKm);

  return {
    id: cleanOptional(input.id),
    sequence,
    origin,
    originPlaceId: cleanOptional(input.originPlaceId),
    originLat: optionalNumber(input.originLat, "origin latitude"),
    originLng: optionalNumber(input.originLng, "origin longitude"),
    originCountry: cleanOptional(input.originCountry),
    destination,
    destinationPlaceId: cleanOptional(input.destinationPlaceId),
    destinationLat: optionalNumber(input.destinationLat, "destination latitude"),
    destinationLng: optionalNumber(input.destinationLng, "destination longitude"),
    destinationCountry: cleanOptional(input.destinationCountry),
    mode,
    status,
    plannedStart: input.plannedStart
      ? parseIsoDate(input.plannedStart.slice(0, 10), "planned start")
      : null,
    plannedEnd: input.plannedEnd
      ? parseIsoDate(input.plannedEnd.slice(0, 10), "planned end")
      : null,
    actualStart: input.actualStart
      ? parseIsoDate(input.actualStart.slice(0, 10), "actual start")
      : null,
    actualEnd: input.actualEnd ? parseIsoDate(input.actualEnd.slice(0, 10), "actual end") : null,
    distanceKm,
    isReturnTrip: Boolean(input.isReturnTrip),
    returnDistanceKm: input.isReturnTrip ? returnDistanceKm : null,
    returnDurationSeconds: input.isReturnTrip
      ? optionalInteger(input.returnDurationSeconds, "return duration")
      : null,
    totalDistanceKm,
    durationSeconds: optionalInteger(input.durationSeconds, "duration"),
    distanceSource: cleanOptional(input.distanceSource),
    routePolyline: cleanOptional(input.routePolyline),
    budgetAmount: optionalNonNegative(input.budgetAmount, "leg budget"),
    containerRef: cleanOptional(input.containerRef),
    notes: cleanOptional(input.notes)
  };
}

function sanitizeTripLegMode(value: string | null | undefined): TexTripLegMode | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value === "road" || value === "sea" || value === "air" || value === "rail") {
    return value;
  }

  throw new Error(`Unsupported trip leg mode: ${value}`);
}

function sanitizeTripLegStatus(value: string | null | undefined): TexTripLegStatus {
  if (!value) {
    return "planned";
  }

  if (
    value === "planned" ||
    value === "in_transit" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new Error(`Unsupported trip leg status: ${value}`);
}
