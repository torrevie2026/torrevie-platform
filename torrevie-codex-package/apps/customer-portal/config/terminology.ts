import type { Locale } from "@torrevie/localization";
import { localeFallback, type BusinessSegment } from "./fsmSegments";

export const termKeys = [
  "customer",
  "customers",
  "job",
  "jobs",
  "asset",
  "assets",
  "site",
  "sites",
  "technician",
  "technicians",
  "request",
  "requests",
  "intakeItem"
] as const;

export type TermKey = (typeof termKeys)[number];
export type TerminologyPack = Record<TermKey, string>;

const englishPacks: Record<BusinessSegment, TerminologyPack> = {
  SOLO: {
    customer: "Customer",
    customers: "Customers",
    job: "Job",
    jobs: "Jobs",
    asset: "Equipment",
    assets: "Equipment",
    site: "Location",
    sites: "Locations",
    technician: "Team Member",
    technicians: "Team Members",
    request: "Message",
    requests: "Messages",
    intakeItem: "Message"
  },
  TRADE: {
    customer: "Client",
    customers: "Clients",
    job: "Job",
    jobs: "Jobs",
    asset: "Asset",
    assets: "Assets",
    site: "Site",
    sites: "Sites",
    technician: "Technician",
    technicians: "Technicians",
    request: "Request",
    requests: "Requests",
    intakeItem: "Request"
  },
  FM: {
    customer: "Client",
    customers: "Clients",
    job: "Work Order",
    jobs: "Work Orders",
    asset: "Asset",
    assets: "Assets",
    site: "Site",
    sites: "Sites",
    technician: "Technician",
    technicians: "Technicians",
    request: "Ticket",
    requests: "Tickets",
    intakeItem: "Ticket"
  },
  COMMUNITY: {
    customer: "Resident",
    customers: "Residents",
    job: "Request Job",
    jobs: "Request Jobs",
    asset: "Common Area Asset",
    assets: "Common Area Assets",
    site: "Building",
    sites: "Buildings",
    technician: "Maintenance Staff",
    technicians: "Maintenance Staff",
    request: "Resident Request",
    requests: "Resident Requests",
    intakeItem: "Resident Request"
  },
  OEM: {
    customer: "Customer",
    customers: "Customers",
    job: "Work Order",
    jobs: "Work Orders",
    asset: "Installed Product",
    assets: "Installed Products",
    site: "Site",
    sites: "Sites",
    technician: "Service Engineer",
    technicians: "Service Engineers",
    request: "Service Request",
    requests: "Service Requests",
    intakeItem: "Service Request"
  }
};

export const terminologyPacks: Record<Locale, Record<BusinessSegment, TerminologyPack>> = {
  en: englishPacks,
  ar: englishPacks
};

export function getTerminologyPack(segment: BusinessSegment, locale: Locale) {
  return terminologyPacks[locale]?.[segment] ?? terminologyPacks[localeFallback(locale)][segment] ?? englishPacks.TRADE;
}

export function term(segment: BusinessSegment, locale: Locale, key: TermKey) {
  return getTerminologyPack(segment, locale)[key];
}
