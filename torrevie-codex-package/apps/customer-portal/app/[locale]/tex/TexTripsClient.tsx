"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { TexBootstrap, TexTripInput, TexTripLeg, TexTripLegInput, TexTripListItem } from "../../../lib/tex";

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

type LegFormState = {
  id: string | null;
  sequence: number;
  origin: string;
  destination: string;
  mode: "road" | "sea" | "air" | "rail" | "";
  status: "planned" | "in_transit" | "completed" | "cancelled";
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  distanceKm: string;
  isReturnTrip: boolean;
  returnDistanceKm: string;
  totalDistanceKm: string;
  durationSeconds: string;
  budgetAmount: string;
  containerRef: string;
  notes: string;
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

const blankLeg = (sequence: number): LegFormState => ({
  id: null,
  sequence,
  origin: "",
  destination: "",
  mode: "road",
  status: "planned",
  plannedStart: "",
  plannedEnd: "",
  actualStart: "",
  actualEnd: "",
  distanceKm: "",
  isReturnTrip: false,
  returnDistanceKm: "",
  totalDistanceKm: "",
  durationSeconds: "",
  budgetAmount: "",
  containerRef: "",
  notes: ""
});

export function TexTripsClient({ teams, employees, initialTrips }: TexTripsClientProps) {
  const [trips, setTrips] = useState(initialTrips);
  const [form, setForm] = useState<TripFormState>(blankTripForm);
  const [legsTrip, setLegsTrip] = useState<TexTripListItem | null>(null);
  const [legs, setLegs] = useState<LegFormState[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);
  const [legsSaving, setLegsSaving] = useState(false);
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

  async function openLegs(trip: TexTripListItem) {
    setLegsTrip(trip);
    setLegs([]);
    setLegsLoading(true);
    setNotice(null);
    setError(null);

    try {
      const response = await texFetch<{ legs: TexTripLeg[] }>(`/trips/${trip.id}/legs`);
      setLegs(response.legs.map(mapLegForForm));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLegsLoading(false);
    }
  }

  function addLeg() {
    setLegs((current) => [...current, blankLeg((current[current.length - 1]?.sequence ?? current.length) + 1)]);
  }

  function removeLeg(index: number) {
    setLegs((current) => resequence(current.filter((_, currentIndex) => currentIndex !== index)));
  }

  function moveLeg(index: number, direction: -1 | 1) {
    setLegs((current) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const currentLeg = next[index];
      const swapLeg = next[nextIndex];

      if (!currentLeg || !swapLeg) {
        return current;
      }

      next[index] = swapLeg;
      next[nextIndex] = currentLeg;
      return resequence(next);
    });
  }

  async function saveLegs() {
    if (!legsTrip) {
      return;
    }

    setLegsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const response = await texFetch<{ legs: TexTripLeg[] }>(`/trips/${legsTrip.id}/legs`, {
        method: "PUT",
        body: JSON.stringify({ legs: legs.map(mapLegForApi) })
      });
      setLegs(response.legs.map(mapLegForForm));
      setNotice("Trip legs saved.");
      await refreshTrips();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLegsSaving(false);
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
        <TripCards trips={openTrips} busyTripId={busyTripId} onEdit={editTrip} onClose={closeTrip} onLegs={openLegs} />
        {closedTrips.length > 0 ? (
          <>
            <button type="button" className="tex-secondary-button tex-inline-button" onClick={() => setShowClosed((current) => !current)}>
              {showClosed ? "Hide" : "Show"} closed trips ({closedTrips.length})
            </button>
            {showClosed ? <TripCards trips={closedTrips} busyTripId={busyTripId} onEdit={editTrip} onClose={closeTrip} onLegs={openLegs} /> : null}
          </>
        ) : null}
      </section>

      {legsTrip ? (
        <section className="tex-form-panel" aria-labelledby="tex-trip-legs-title">
          <div className="section-heading-row">
            <div>
              <h3 id="tex-trip-legs-title">Legs - {legsTrip.name}</h3>
              <p>
                {legs.length} legs
                {legDistanceTotal(legs) > 0 ? ` - ${formatAmount(legDistanceTotal(legs))} km total` : ""}
              </p>
            </div>
            <button type="button" className="tex-secondary-button" onClick={() => setLegsTrip(null)}>
              Close
            </button>
          </div>

          {legsLoading ? <p>Loading legs...</p> : null}
          {!legsLoading && legs.length === 0 ? <p>No legs yet. Add the first route leg below.</p> : null}
          <div className="tex-trip-list">
            {legs.map((leg, index) => (
              <article key={leg.id ?? `new-${index}`} className="tex-trip-card">
                <header>
                  <div>
                    <span className={`tex-status tex-status-${leg.status}`}>Leg {index + 1}</span>
                    <h4>{leg.origin || "Origin"} to {leg.destination || "Destination"}</h4>
                  </div>
                  <strong>{formatAmount(legTotalDistance(leg))} km</strong>
                </header>
                <div className="tex-form-grid">
                  <label>
                    Origin
                    <input value={leg.origin} onChange={(event) => updateLeg(setLegs, index, { origin: event.target.value })} />
                  </label>
                  <label>
                    Destination
                    <input value={leg.destination} onChange={(event) => updateLeg(setLegs, index, { destination: event.target.value })} />
                  </label>
                  <label>
                    Mode
                    <select value={leg.mode} onChange={(event) => updateLeg(setLegs, index, { mode: event.target.value as LegFormState["mode"] })}>
                      <option value="">None</option>
                      <option value="road">Road</option>
                      <option value="sea">Sea</option>
                      <option value="air">Air</option>
                      <option value="rail">Rail</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={leg.status}
                      onChange={(event) => updateLeg(setLegs, index, { status: event.target.value as LegFormState["status"] })}
                    >
                      <option value="planned">Planned</option>
                      <option value="in_transit">In transit</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                  <label>
                    Planned start
                    <input type="date" value={leg.plannedStart} onChange={(event) => updateLeg(setLegs, index, { plannedStart: event.target.value })} />
                  </label>
                  <label>
                    Planned end
                    <input type="date" value={leg.plannedEnd} onChange={(event) => updateLeg(setLegs, index, { plannedEnd: event.target.value })} />
                  </label>
                  <label>
                    Actual start
                    <input type="date" value={leg.actualStart} onChange={(event) => updateLeg(setLegs, index, { actualStart: event.target.value })} />
                  </label>
                  <label>
                    Actual end
                    <input type="date" value={leg.actualEnd} onChange={(event) => updateLeg(setLegs, index, { actualEnd: event.target.value })} />
                  </label>
                  <label>
                    Outbound distance km
                    <input
                      inputMode="decimal"
                      value={leg.distanceKm}
                      onChange={(event) => updateLegDistance(setLegs, index, event.target.value)}
                    />
                  </label>
                  <label>
                    Return distance km
                    <input
                      inputMode="decimal"
                      disabled={!leg.isReturnTrip}
                      value={leg.returnDistanceKm}
                      onChange={(event) => updateLegReturnDistance(setLegs, index, event.target.value)}
                    />
                  </label>
                  <label>
                    Budget
                    <input inputMode="decimal" value={leg.budgetAmount} onChange={(event) => updateLeg(setLegs, index, { budgetAmount: event.target.value })} />
                  </label>
                  <label>
                    Container / BL
                    <input value={leg.containerRef} onChange={(event) => updateLeg(setLegs, index, { containerRef: event.target.value })} />
                  </label>
                </div>
                <label className="tex-checkbox-row">
                  <input
                    type="checkbox"
                    checked={leg.isReturnTrip}
                    onChange={(event) => updateLegReturnToggle(setLegs, index, event.target.checked)}
                  />
                  Return to origin
                </label>
                <label className="tex-wide-label">
                  Notes
                  <input value={leg.notes} onChange={(event) => updateLeg(setLegs, index, { notes: event.target.value })} />
                </label>
                <footer>
                  <button type="button" disabled={index === 0} onClick={() => moveLeg(index, -1)}>
                    Move up
                  </button>
                  <button type="button" disabled={index === legs.length - 1} onClick={() => moveLeg(index, 1)}>
                    Move down
                  </button>
                  <button type="button" onClick={() => removeLeg(index)}>
                    Remove
                  </button>
                </footer>
              </article>
            ))}
          </div>

          <div className="tex-hero-actions">
            <button type="button" className="tex-secondary-button" onClick={addLeg}>
              Add leg
            </button>
            <button type="button" className="tex-primary-button" disabled={legsSaving || legs.length === 0} onClick={saveLegs}>
              {legsSaving ? "Saving..." : "Save legs"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TripCards({
  trips,
  busyTripId,
  onEdit,
  onClose,
  onLegs
}: {
  trips: TexTripListItem[];
  busyTripId: string | null;
  onEdit: (trip: TexTripListItem) => void;
  onClose: (tripId: string) => void;
  onLegs: (trip: TexTripListItem) => void;
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
              <span>{trip.legCount} legs</span>
              <span>{trip.totalDistanceKm ? `${formatAmount(trip.totalDistanceKm)} km` : "No distance"}</span>
              <span>{trip.budgetAmount ? `${formatAmount(trip.budgetAmount)} budget` : "No budget"}</span>
              <span>{trip.driverName ?? "No driver"}</span>
              {trip.tripType === "logistics" ? <span>{trip.containerNumber ?? "No container"}</span> : null}
            </div>
            <footer>
              {trip.tripType === "logistics" ? (
                <button type="button" onClick={() => onLegs(trip)}>
                  Legs
                </button>
              ) : null}
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

function mapLegForForm(leg: TexTripLeg): LegFormState {
  return {
    id: leg.id,
    sequence: leg.sequence,
    origin: leg.origin,
    destination: leg.destination,
    mode: leg.mode ?? "",
    status: leg.status,
    plannedStart: dateInputValue(leg.plannedStart),
    plannedEnd: dateInputValue(leg.plannedEnd),
    actualStart: dateInputValue(leg.actualStart),
    actualEnd: dateInputValue(leg.actualEnd),
    distanceKm: leg.distanceKm === null ? "" : String(leg.distanceKm),
    isReturnTrip: leg.isReturnTrip,
    returnDistanceKm: leg.returnDistanceKm === null ? "" : String(leg.returnDistanceKm),
    totalDistanceKm: leg.totalDistanceKm === null ? "" : String(leg.totalDistanceKm),
    durationSeconds: leg.durationSeconds === null ? "" : String(leg.durationSeconds),
    budgetAmount: leg.budgetAmount === null ? "" : String(leg.budgetAmount),
    containerRef: leg.containerRef ?? "",
    notes: leg.notes ?? ""
  };
}

function mapLegForApi(leg: LegFormState): TexTripLegInput {
  return {
    id: leg.id,
    sequence: leg.sequence,
    origin: leg.origin,
    destination: leg.destination,
    mode: leg.mode || null,
    status: leg.status,
    plannedStart: leg.plannedStart || null,
    plannedEnd: leg.plannedEnd || null,
    actualStart: leg.actualStart || null,
    actualEnd: leg.actualEnd || null,
    distanceKm: readOptionalNumber(leg.distanceKm),
    isReturnTrip: leg.isReturnTrip,
    returnDistanceKm: leg.isReturnTrip ? readOptionalNumber(leg.returnDistanceKm) : null,
    totalDistanceKm: readOptionalNumber(leg.totalDistanceKm) ?? legTotalDistance(leg),
    durationSeconds: readOptionalNumber(leg.durationSeconds),
    budgetAmount: readOptionalNumber(leg.budgetAmount),
    containerRef: leg.containerRef || null,
    notes: leg.notes || null
  };
}

function updateLeg(setLegs: Dispatch<SetStateAction<LegFormState[]>>, index: number, patch: Partial<LegFormState>) {
  setLegs((current) => current.map((leg, currentIndex) => (currentIndex === index ? { ...leg, ...patch } : leg)));
}

function updateLegDistance(setLegs: Dispatch<SetStateAction<LegFormState[]>>, index: number, distanceKm: string) {
  setLegs((current) =>
    current.map((leg, currentIndex) => {
      if (currentIndex !== index) {
        return leg;
      }

      const outbound = readOptionalNumber(distanceKm);
      const returnDistance = leg.isReturnTrip ? readOptionalNumber(leg.returnDistanceKm) ?? outbound : null;
      const totalDistance = outbound === null ? "" : String(leg.isReturnTrip ? outbound + (returnDistance ?? outbound) : outbound);
      return {
        ...leg,
        distanceKm,
        returnDistanceKm: leg.isReturnTrip && !leg.returnDistanceKm ? distanceKm : leg.returnDistanceKm,
        totalDistanceKm: totalDistance
      };
    })
  );
}

function updateLegReturnDistance(setLegs: Dispatch<SetStateAction<LegFormState[]>>, index: number, returnDistanceKm: string) {
  setLegs((current) =>
    current.map((leg, currentIndex) => {
      if (currentIndex !== index) {
        return leg;
      }

      const outbound = readOptionalNumber(leg.distanceKm);
      const returnDistance = readOptionalNumber(returnDistanceKm);
      return {
        ...leg,
        returnDistanceKm,
        totalDistanceKm: outbound === null ? "" : String(outbound + (returnDistance ?? outbound))
      };
    })
  );
}

function updateLegReturnToggle(setLegs: Dispatch<SetStateAction<LegFormState[]>>, index: number, isReturnTrip: boolean) {
  setLegs((current) =>
    current.map((leg, currentIndex) => {
      if (currentIndex !== index) {
        return leg;
      }

      const outbound = readOptionalNumber(leg.distanceKm);
      const returnDistance = isReturnTrip ? readOptionalNumber(leg.returnDistanceKm) ?? outbound : null;
      return {
        ...leg,
        isReturnTrip,
        returnDistanceKm: isReturnTrip ? leg.returnDistanceKm || leg.distanceKm : "",
        totalDistanceKm: outbound === null ? "" : String(isReturnTrip ? outbound + (returnDistance ?? outbound) : outbound)
      };
    })
  );
}

function resequence(legs: LegFormState[]) {
  return legs.map((leg, index) => ({ ...leg, sequence: index + 1 }));
}

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function legDistanceTotal(legs: LegFormState[]) {
  return legs.reduce((total, leg) => total + legTotalDistance(leg), 0);
}

function legTotalDistance(leg: LegFormState) {
  const explicitTotal = readOptionalNumber(leg.totalDistanceKm);

  if (explicitTotal !== null) {
    return explicitTotal;
  }

  const outbound = readOptionalNumber(leg.distanceKm) ?? 0;
  return leg.isReturnTrip ? outbound + (readOptionalNumber(leg.returnDistanceKm) ?? outbound) : outbound;
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
