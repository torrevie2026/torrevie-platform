"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { TexBootstrap, TexTripInput, TexTripListItem } from "../../../lib/tex";

type TexTripsClientProps = {
  teams: TexBootstrap["teams"];
  employees: TexBootstrap["employeeProfiles"];
  initialTrips: TexTripListItem[];
};

type TripFormState = {
  id: string | null;
  name: string;
  description: string;
  tripType: "general" | "logistics";
  origin: string;
  destination: string;
  budgetAmount: string;
  startDate: string;
  endDate: string;
  enforceCurrency: boolean;
  enforcedCurrency: string;
  teamId: string;
  containerNumber: string;
  driverEmployeeProfileId: string;
  driverTripAmount: string;
  subcontractorDriverName: string;
  subcontractorAmount: string;
  subcontractorNotes: string;
};

const blankTripForm = (): TripFormState => ({
  id: null,
  name: "",
  description: "",
  tripType: "general",
  origin: "",
  destination: "",
  budgetAmount: "",
  startDate: "",
  endDate: "",
  enforceCurrency: false,
  enforcedCurrency: "AED",
  teamId: "",
  containerNumber: "",
  driverEmployeeProfileId: "",
  driverTripAmount: "",
  subcontractorDriverName: "",
  subcontractorAmount: "",
  subcontractorNotes: ""
});

export function TexTripsClient({ teams, employees, initialTrips }: TexTripsClientProps) {
  const [trips, setTrips] = useState(initialTrips);
  const [form, setForm] = useState<TripFormState>(blankTripForm);
  const [showClosed, setShowClosed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openTrips = useMemo(() => trips.filter((trip) => trip.status === "open"), [trips]);
  const closedTrips = useMemo(() => trips.filter((trip) => trip.status !== "open"), [trips]);

  async function refreshTrips() {
    const response = await texFetch<{ trips: TexTripListItem[] }>("/trips");
    setTrips(response.trips);
  }

  function editTrip(trip: TexTripListItem) {
    setForm({
      id: trip.id,
      name: trip.name,
      description: trip.description ?? "",
      tripType: trip.tripType,
      origin: trip.origin ?? "",
      destination: trip.destination ?? "",
      budgetAmount: trip.budgetAmount === null ? "" : String(trip.budgetAmount),
      startDate: trip.startDate ?? "",
      endDate: trip.endDate ?? "",
      enforceCurrency: trip.enforceCurrency,
      enforcedCurrency: trip.enforcedCurrency ?? "AED",
      teamId: trip.teamId ?? "",
      containerNumber: trip.containerNumber ?? "",
      driverEmployeeProfileId: trip.driverEmployeeProfileId ?? "",
      driverTripAmount: trip.driverTripAmount ? String(trip.driverTripAmount) : "",
      subcontractorDriverName: trip.subcontractorDriverName ?? "",
      subcontractorAmount: trip.subcontractorAmount ? String(trip.subcontractorAmount) : "",
      subcontractorNotes: ""
    });
    setNotice(null);
    setError(null);
  }

  async function saveTrip() {
    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const payload: TexTripInput = {
        name: form.name,
        description: form.description || null,
        tripType: form.tripType,
        origin: form.origin || null,
        destination: form.destination || null,
        budgetAmount: readOptionalNumber(form.budgetAmount),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        enforceCurrency: form.enforceCurrency,
        enforcedCurrency: form.enforceCurrency ? form.enforcedCurrency : null,
        teamId: form.teamId || null,
        containerNumber: form.containerNumber || null,
        driverEmployeeProfileId: form.driverEmployeeProfileId || null,
        driverTripAmount: readOptionalNumber(form.driverTripAmount),
        subcontractorDriverName: form.subcontractorDriverName || null,
        subcontractorAmount: readOptionalNumber(form.subcontractorAmount),
        subcontractorNotes: form.subcontractorNotes || null
      };
      await texFetch(form.id ? `/trips/${form.id}` : "/trips", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setNotice(form.id ? "Trip updated." : "Trip created.");
      setForm(blankTripForm());
      await refreshTrips();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function closeTrip(tripId: string) {
    setBusyTripId(tripId);
    setNotice(null);
    setError(null);

    try {
      await texFetch(`/trips/${tripId}/close`, { method: "PATCH", body: "{}" });
      setNotice("Trip closed.");
      await refreshTrips();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyTripId(null);
    }
  }

  return (
    <div className="tex-trip-workspace">
      <section className="tex-form-panel" aria-labelledby="tex-trip-form-title">
        <div className="section-heading-row">
          <h3 id="tex-trip-form-title">{form.id ? "Edit trip" : "New trip"}</h3>
          <button type="button" className="tex-secondary-button" onClick={() => setForm(blankTripForm())}>
            Clear
          </button>
        </div>

        <div className="tex-form-grid">
          <label>
            Trip name
            <input value={form.name} onChange={(event) => setFormValue(setForm, "name", event.target.value)} />
          </label>
          <label>
            Type
            <select value={form.tripType} onChange={(event) => setFormValue(setForm, "tripType", event.target.value)}>
              <option value="general">General</option>
              <option value="logistics">Logistics</option>
            </select>
          </label>
          <label>
            Origin
            <input value={form.origin} onChange={(event) => setFormValue(setForm, "origin", event.target.value)} />
          </label>
          <label>
            Destination
            <input value={form.destination} onChange={(event) => setFormValue(setForm, "destination", event.target.value)} />
          </label>
          <label>
            Start
            <input type="date" value={form.startDate} onChange={(event) => setFormValue(setForm, "startDate", event.target.value)} />
          </label>
          <label>
            End
            <input type="date" value={form.endDate} onChange={(event) => setFormValue(setForm, "endDate", event.target.value)} />
          </label>
          <label>
            Budget
            <input inputMode="decimal" value={form.budgetAmount} onChange={(event) => setFormValue(setForm, "budgetAmount", event.target.value)} />
          </label>
          <label>
            Team
            <select value={form.teamId} onChange={(event) => setFormValue(setForm, "teamId", event.target.value)}>
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Driver
            <select
              value={form.driverEmployeeProfileId}
              onChange={(event) => setFormValue(setForm, "driverEmployeeProfileId", event.target.value)}
            >
              <option value="">No driver</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Driver amount
            <input
              inputMode="decimal"
              value={form.driverTripAmount}
              onChange={(event) => setFormValue(setForm, "driverTripAmount", event.target.value)}
            />
          </label>
          <label>
            Container
            <input value={form.containerNumber} onChange={(event) => setFormValue(setForm, "containerNumber", event.target.value)} />
          </label>
          <label>
            External driver amount
            <input
              inputMode="decimal"
              value={form.subcontractorAmount}
              onChange={(event) => setFormValue(setForm, "subcontractorAmount", event.target.value)}
            />
          </label>
        </div>

        <label className="tex-wide-label">
          Description
          <input value={form.description} onChange={(event) => setFormValue(setForm, "description", event.target.value)} />
        </label>
        <label className="tex-checkbox-row">
          <input
            type="checkbox"
            checked={form.enforceCurrency}
            onChange={(event) => setForm((current) => ({ ...current, enforceCurrency: event.target.checked }))}
          />
          Enforce one currency
        </label>
        {form.enforceCurrency ? (
          <label className="tex-wide-label">
            Currency
            <input
              value={form.enforcedCurrency}
              maxLength={3}
              onChange={(event) => setFormValue(setForm, "enforcedCurrency", event.target.value.toUpperCase())}
            />
          </label>
        ) : null}

        <button type="button" className="tex-primary-button" disabled={isSaving || !form.name.trim()} onClick={saveTrip}>
          {isSaving ? "Saving..." : form.id ? "Update trip" : "Create trip"}
        </button>
        {notice ? <p className="tex-notice">{notice}</p> : null}
        {error ? <p className="tex-error">{error}</p> : null}
      </section>

      <section className="tex-form-panel" aria-labelledby="tex-trip-list-title">
        <div className="section-heading-row">
          <h3 id="tex-trip-list-title">Trip board</h3>
          <button type="button" className="tex-secondary-button" onClick={refreshTrips}>
            Refresh
          </button>
        </div>
        <TripCards trips={openTrips} busyTripId={busyTripId} onEdit={editTrip} onClose={closeTrip} />
        {closedTrips.length > 0 ? (
          <>
            <button type="button" className="tex-secondary-button tex-inline-button" onClick={() => setShowClosed((current) => !current)}>
              {showClosed ? "Hide" : "Show"} closed trips ({closedTrips.length})
            </button>
            {showClosed ? <TripCards trips={closedTrips} busyTripId={busyTripId} onEdit={editTrip} onClose={closeTrip} /> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

function TripCards({
  trips,
  busyTripId,
  onEdit,
  onClose
}: {
  trips: TexTripListItem[];
  busyTripId: string | null;
  onEdit: (trip: TexTripListItem) => void;
  onClose: (tripId: string) => void;
}) {
  if (trips.length === 0) {
    return <p>No trips in this view.</p>;
  }

  return (
    <div className="tex-trip-list">
      {trips.map((trip) => {
        const budgetUsage = trip.budgetAmount && trip.budgetAmount > 0 ? Math.min((trip.spendAmount / trip.budgetAmount) * 100, 100) : 0;

        return (
          <article key={trip.id} className="tex-trip-card">
            <header>
              <div>
                <span className={`tex-status tex-status-${trip.status}`}>{trip.status}</span>
                <h4>{trip.name}</h4>
                <p>
                  {trip.origin ?? "-"} to {trip.destination ?? "-"}
                  {trip.teamName ? ` · ${trip.teamName}` : ""}
                </p>
              </div>
              <strong>{formatAmount(trip.spendAmount)} spent</strong>
            </header>
            {trip.budgetAmount ? (
              <div className="tex-budget-bar" aria-label={`Budget used ${budgetUsage.toFixed(0)} percent`}>
                <span style={{ inlineSize: `${budgetUsage}%` }} />
              </div>
            ) : null}
            <div className="tex-trip-meta">
              <span>{trip.expenseCount} expenses</span>
              <span>{trip.budgetAmount ? `${formatAmount(trip.budgetAmount)} budget` : "No budget"}</span>
              <span>{trip.driverName ?? "No driver"}</span>
              {trip.tripType === "logistics" ? <span>{trip.containerNumber ?? "No container"}</span> : null}
            </div>
            <footer>
              <button type="button" onClick={() => onEdit(trip)}>
                Edit
              </button>
              {trip.status === "open" ? (
                <button type="button" disabled={busyTripId === trip.id} onClick={() => onClose(trip.id)}>
                  Close
                </button>
              ) : null}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function setFormValue(
  setForm: Dispatch<SetStateAction<TripFormState>>,
  key: keyof TripFormState,
  value: string
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function readOptionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

async function texFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/tex${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "TEX request failed.");
  }

  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "TEX request failed.";
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}
