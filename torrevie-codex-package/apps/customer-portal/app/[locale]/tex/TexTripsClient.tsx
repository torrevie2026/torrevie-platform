"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
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
  originPlaceId: string;
  destination: string;
  destinationPlaceId: string;
  budgetAmount: string;
  advanceDepositFileId: string;
  advanceDepositFileName: string;
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
  originPlaceId: string;
  destination: string;
  destinationPlaceId: string;
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
  distanceSource: string;
  routePolyline: string;
  budgetAmount: string;
  containerRef: string;
  notes: string;
};

type PlaceSuggestion = {
  placeId: string;
  text: string;
};

type ReceiptUploadResponse = {
  receipt: {
    id: string;
    filename: string;
  };
};

const blankTripForm = (): TripFormState => ({
  id: null,
  name: "",
  description: "",
  tripType: "general",
  origin: "",
  originPlaceId: "",
  destination: "",
  destinationPlaceId: "",
  budgetAmount: "",
  advanceDepositFileId: "",
  advanceDepositFileName: "",
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
  originPlaceId: "",
  destination: "",
  destinationPlaceId: "",
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
  distanceSource: "",
  routePolyline: "",
  budgetAmount: "",
  containerRef: "",
  notes: ""
});

export function TexTripsClient({ teams, employees, initialTrips }: TexTripsClientProps) {
  const [trips, setTrips] = useState(initialTrips);
  const [form, setForm] = useState<TripFormState>(blankTripForm);
  const tripEndDateRef = useRef<HTMLInputElement>(null);
  const [legsTrip, setLegsTrip] = useState<TexTripListItem | null>(null);
  const [legs, setLegs] = useState<LegFormState[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);
  const [legsSaving, setLegsSaving] = useState(false);
  const [estimatingLegIndex, setEstimatingLegIndex] = useState<number | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTripDrawerOpen, setIsTripDrawerOpen] = useState(false);
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [tripNotice, setTripNotice] = useState<string | null>(null);
  const [tripError, setTripError] = useState<string | null>(null);
  const [legsNotice, setLegsNotice] = useState<string | null>(null);
  const [legsError, setLegsError] = useState<string | null>(null);
  const openTrips = useMemo(() => trips.filter((trip) => trip.status === "open"), [trips]);
  const closedTrips = useMemo(() => trips.filter((trip) => trip.status !== "open"), [trips]);
  const selectedTeam = teams.find((team) => team.id === form.teamId);
  const driverOptions = useMemo(() => {
    if (!selectedTeam) {
      return employees.filter((employee) => employee.isActive);
    }

    const memberIds = new Set(selectedTeam.memberEmployeeProfileIds);
    return employees.filter((employee) => employee.isActive && memberIds.has(employee.id));
  }, [employees, selectedTeam]);
  const isInternalDriver = Boolean(form.driverEmployeeProfileId);

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
      originPlaceId: "",
      destination: trip.destination ?? "",
      destinationPlaceId: "",
      budgetAmount: trip.budgetAmount === null ? "" : String(trip.budgetAmount),
      advanceDepositFileId: "",
      advanceDepositFileName: "",
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
    setTripNotice(null);
    setTripError(null);
    setIsTripDrawerOpen(true);
  }

  function openNewTripDrawer() {
    setForm(blankTripForm());
    setTripNotice(null);
    setTripError(null);
    setIsTripDrawerOpen(true);
  }

  function closeTripDrawer() {
    setIsTripDrawerOpen(false);
    setForm(blankTripForm());
  }

  async function saveTrip() {
    setIsSaving(true);
    setTripNotice(null);
    setTripError(null);

    try {
      const payload: TexTripInput = {
        name: form.name,
        description: form.description || null,
        tripType: form.tripType,
        origin: form.origin || null,
        destination: form.destination || null,
        budgetAmount: readOptionalNumber(form.budgetAmount),
        advanceDepositFileId: form.advanceDepositFileId || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        enforceCurrency: false,
        enforcedCurrency: null,
        teamId: form.teamId || null,
        containerNumber: form.containerNumber || null,
        driverEmployeeProfileId: form.driverEmployeeProfileId || null,
        driverTripAmount: readOptionalNumber(form.driverTripAmount),
        subcontractorDriverName: form.driverEmployeeProfileId ? null : form.subcontractorDriverName || null,
        subcontractorAmount: form.driverEmployeeProfileId ? null : readOptionalNumber(form.subcontractorAmount),
        subcontractorNotes: form.driverEmployeeProfileId ? null : form.subcontractorNotes || null
      };
      const response = await texFetch<{ trip: TexTripListItem }>(form.id ? `/trips/${form.id}` : "/trips", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setTrips((current) =>
        form.id
          ? current.map((trip) => (trip.id === response.trip.id ? response.trip : trip))
          : [response.trip, ...current]
      );
      if (!form.id) {
        void createInitialTripLeg(response.trip.id).then((legNotice) => {
          if (legNotice) {
            setTripNotice(legNotice);
          }
          void refreshTrips();
        });
      } else {
        void refreshTrips();
      }
      setTripNotice(form.id ? "Trip updated." : "Trip created. Initial leg is being prepared.");
      setForm(blankTripForm());
      setIsTripDrawerOpen(false);
    } catch (caught) {
      setTripError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function closeTrip(tripId: string) {
    setBusyTripId(tripId);
    setTripNotice(null);
    setTripError(null);

    try {
      await texFetch(`/trips/${tripId}/close`, { method: "PATCH", body: "{}" });
      setTripNotice("Trip closed.");
      await refreshTrips();
    } catch (caught) {
      setTripError(errorMessage(caught));
    } finally {
      setBusyTripId(null);
    }
  }

  async function openLegs(trip: TexTripListItem) {
    setLegsTrip(trip);
    setLegs([]);
    setLegsLoading(true);
    setLegsNotice(null);
    setLegsError(null);

    try {
      const response = await texFetch<{ legs: TexTripLeg[] }>(`/trips/${trip.id}/legs`);
      setLegs(response.legs.map(mapLegForForm));
    } catch (caught) {
      setLegsError(errorMessage(caught));
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
    setLegsNotice(null);
    setLegsError(null);

    try {
      const response = await texFetch<{ legs: TexTripLeg[] }>(`/trips/${legsTrip.id}/legs`, {
        method: "PUT",
        body: JSON.stringify({ legs: legs.map(mapLegForApi) })
      });
      setLegs(response.legs.map(mapLegForForm));
      setLegsNotice("Trip legs saved.");
      await refreshTrips();
    } catch (caught) {
      setLegsError(errorMessage(caught));
    } finally {
      setLegsSaving(false);
    }
  }

  async function createInitialTripLeg(tripId: string) {
    if (!form.origin.trim() || !form.destination.trim()) {
      return "";
    }

    const leg: TexTripLegInput = {
      sequence: 1,
      origin: form.origin,
      originPlaceId: form.originPlaceId || null,
      destination: form.destination,
      destinationPlaceId: form.destinationPlaceId || null,
      mode: "road",
      status: "planned",
      plannedStart: form.startDate || null,
      plannedEnd: form.endDate || null,
      budgetAmount: readOptionalNumber(form.budgetAmount),
      containerRef: form.containerNumber || null,
      notes: "Created from trip origin and destination"
    };

    try {
      await texFetch(`/trips/${tripId}/legs`, {
        method: "PUT",
        body: JSON.stringify({ legs: [leg] })
      });
      return "Initial road leg created. Use Estimate on the legs screen when Google distance is needed.";
    } catch (caught) {
      return `Trip saved, but the initial leg could not be created: ${errorMessage(caught)}`;
    }
  }

  async function uploadAdvanceDeposit(file: File) {
    setTripError(null);
    try {
      const upload = await texFetch<ReceiptUploadResponse>("/receipts", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64: await fileToDataUrl(file)
        })
      });
      setForm((current) => ({
        ...current,
        advanceDepositFileId: upload.receipt.id,
        advanceDepositFileName: upload.receipt.filename || file.name
      }));
    } catch (caught) {
      setTripError(errorMessage(caught));
    }
  }

  async function estimateLeg(index: number) {
    const leg = legs[index];

    if (!leg) {
      return;
    }

    if (!leg.origin.trim() || !leg.destination.trim()) {
      setLegsError("Origin and destination are required before estimating a leg.");
      return;
    }

    if (leg.mode && leg.mode !== "road") {
      setLegsError("Google Maps route estimates are available for road legs.");
      return;
    }

    if (!legsTrip) {
      return;
    }

    setEstimatingLegIndex(index);
    setLegsNotice(null);
    setLegsError(null);

    try {
      const response = await texFetch<{
        estimate: {
          distanceKm: number;
          durationSeconds: number | null;
          routePolyline: string | null;
          source: string;
          isReturnTrip: boolean;
          returnDistanceKm: number | null;
          returnDurationSeconds: number | null;
          totalDistanceKm: number;
        };
      }>(`/trips/${legsTrip.id}/legs/estimate`, {
        method: "POST",
        body: JSON.stringify({
          origin: leg.origin,
          originPlaceId: leg.originPlaceId || null,
          destination: leg.destination,
          destinationPlaceId: leg.destinationPlaceId || null,
          returnToOrigin: leg.isReturnTrip
        })
      });
      updateLeg(setLegs, index, {
        mode: "road",
        distanceKm: String(response.estimate.distanceKm),
        isReturnTrip: response.estimate.isReturnTrip,
        returnDistanceKm: response.estimate.returnDistanceKm === null ? "" : String(response.estimate.returnDistanceKm),
        totalDistanceKm: String(response.estimate.totalDistanceKm),
        durationSeconds: response.estimate.durationSeconds === null ? "" : String(response.estimate.durationSeconds),
        distanceSource: response.estimate.source,
        routePolyline: response.estimate.routePolyline ?? ""
      });
      setLegsNotice("Google Maps distance estimated.");
    } catch (caught) {
      setLegsError(errorMessage(caught));
    } finally {
      setEstimatingLegIndex(null);
    }
  }

  return (
    <div className="tex-trip-workspace">
      {isTripDrawerOpen ? (
        <div className="tex-drawer-backdrop" role="presentation" onMouseDown={closeTripDrawer}>
          <aside
            className="tex-drawer"
            aria-labelledby="tex-trip-form-title"
            aria-modal="true"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading-row">
              <h3 id="tex-trip-form-title">{form.id ? "Edit trip" : "New trip"}</h3>
              <button type="button" className="tex-secondary-button" onClick={closeTripDrawer}>
                Close
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
              <div className="tex-place-field">
                <label htmlFor="tex-trip-origin">Origin</label>
                <input
                  id="tex-trip-origin"
                  value={form.origin}
                  placeholder="e.g. Jebel Ali Port"
                  onChange={(event) => setFormValue(setForm, "origin", event.target.value)}
                />
              </div>
              <div className="tex-place-field">
                <label htmlFor="tex-trip-destination">Destination</label>
                <input
                  id="tex-trip-destination"
                  value={form.destination}
                  placeholder="e.g. Riyadh DC"
                  onChange={(event) => setFormValue(setForm, "destination", event.target.value)}
                />
              </div>
              <label>
                Start
                <input
                  lang="en-GB"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((current) => ({
                      ...current,
                      startDate: value,
                      endDate: current.endDate || value
                    }));
                    focusDateInput(tripEndDateRef);
                  }}
                />
              </label>
              <label>
                End
                <input
                  lang="en-GB"
                  ref={tripEndDateRef}
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setFormValue(setForm, "endDate", event.target.value)}
                />
              </label>
              <label>
                Driver advance / budget
                <input inputMode="decimal" value={form.budgetAmount} onChange={(event) => setFormValue(setForm, "budgetAmount", event.target.value)} />
              </label>
              <label>
                Team
                <select
                  value={form.teamId}
                  onChange={(event) => {
                    const teamId = event.target.value;
                    const nextTeam = teams.find((team) => team.id === teamId);
                    setForm((current) => {
                      if (!nextTeam || !current.driverEmployeeProfileId) {
                        return { ...current, teamId };
                      }

                      return nextTeam.memberEmployeeProfileIds.includes(current.driverEmployeeProfileId)
                        ? { ...current, teamId }
                        : { ...current, teamId, driverEmployeeProfileId: "" };
                    });
                  }}
                >
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
                  onChange={(event) => {
                    const driverEmployeeProfileId = event.target.value;
                    setForm((current) => ({
                      ...current,
                      driverEmployeeProfileId,
                      subcontractorDriverName: driverEmployeeProfileId ? "" : current.subcontractorDriverName,
                      subcontractorAmount: driverEmployeeProfileId ? "" : current.subcontractorAmount,
                      subcontractorNotes: driverEmployeeProfileId ? "" : current.subcontractorNotes
                    }));
                  }}
                >
                  <option value="">External driver</option>
                  {driverOptions.map((employee) => (
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
                  disabled={isInternalDriver}
                  value={form.subcontractorAmount}
                  onChange={(event) => setFormValue(setForm, "subcontractorAmount", event.target.value)}
                />
              </label>
              <label>
                External driver name
                <input
                  disabled={isInternalDriver}
                  value={form.subcontractorDriverName}
                  onChange={(event) => setFormValue(setForm, "subcontractorDriverName", event.target.value)}
                />
              </label>
            </div>

            <div className="tex-receipt-upload">
              <div>
                <strong>Advance receipt</strong>
                <p>Attach the driver advance/deposit receipt linked to this trip budget.</p>
              </div>
              {form.advanceDepositFileName ? (
                <div className="tex-receipt-file">
                  <span>{form.advanceDepositFileName}</span>
                  <button
                    type="button"
                    className="tex-secondary-button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        advanceDepositFileId: "",
                        advanceDepositFileName: ""
                      }))
                    }
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <label className="tex-receipt-drop">
                  <input
                    type="file"
                    accept=".jpeg,.jpg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadAdvanceDeposit(file);
                      }
                    }}
                  />
                  <span>Attach advance receipt</span>
                  <small>JPEG, PNG, WEBP, HEIC, or PDF</small>
                </label>
              )}
            </div>

            <label className="tex-wide-label">
              Description
              <input value={form.description} onChange={(event) => setFormValue(setForm, "description", event.target.value)} />
            </label>
            <button type="button" className="tex-primary-button" disabled={isSaving || !form.name.trim()} onClick={saveTrip}>
              {isSaving ? "Saving..." : form.id ? "Update trip" : "Create trip"}
            </button>
            {tripError ? <p className="tex-error">{tripError}</p> : null}
          </aside>
        </div>
      ) : null}

      <section className="tex-form-panel" aria-labelledby="tex-trip-list-title">
        <div className="section-heading-row">
          <h3 id="tex-trip-list-title">Trip board</h3>
          <div className="tex-panel-actions">
            <button type="button" className="tex-primary-button" onClick={openNewTripDrawer}>
              New trip
            </button>
            <button type="button" className="tex-secondary-button" onClick={refreshTrips}>
              Refresh
            </button>
          </div>
        </div>
        {tripNotice ? <p className="tex-notice">{tripNotice}</p> : null}
        {tripError ? <p className="tex-error">{tripError}</p> : null}
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
        <div
          className="tex-drawer-backdrop"
          role="presentation"
          onMouseDown={() => {
            setLegsTrip(null);
            setLegsNotice(null);
            setLegsError(null);
          }}
        >
          <aside
            className="tex-drawer tex-drawer-wide"
            aria-labelledby="tex-trip-legs-title"
            aria-modal="true"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading-row">
              <div>
                <h3 id="tex-trip-legs-title">Legs - {legsTrip.name}</h3>
                <p>
                  {legs.length} legs
                  {legDistanceTotal(legs) > 0 ? ` - ${formatAmount(legDistanceTotal(legs))} km total` : ""}
                </p>
              </div>
              <button
                type="button"
                className="tex-secondary-button"
                onClick={() => {
                  setLegsTrip(null);
                  setLegsNotice(null);
                  setLegsError(null);
                }}
              >
                Close
              </button>
            </div>

            {legsLoading ? <p>Loading legs...</p> : null}
            {!legsLoading && legs.length === 0 ? <p>No legs yet. Add the first route leg below.</p> : null}
            <div className="tex-trip-list">
              {legs.map((leg, index) => (
                <article key={leg.id ?? `new-${index}`} className="tex-trip-card tex-leg-card">
                  <header>
                    <div>
                      <span className={`tex-status tex-status-${leg.status}`}>Leg {index + 1}</span>
                      <h4>{leg.origin || "Origin"} to {leg.destination || "Destination"}</h4>
                    </div>
                    <strong>{formatAmount(legTotalDistance(leg))} km</strong>
                  </header>
                  <div className="tex-leg-form-sections">
                    <section className="tex-leg-form-section" aria-label={`Leg ${index + 1} route`}>
                      <h5>Route</h5>
                      <div className="tex-form-grid">
                        <LegPlaceInput
                          label="Origin"
                          value={leg.origin}
                          placeId={leg.originPlaceId}
                          onChange={(value, placeId) => updateLeg(setLegs, index, { origin: value, originPlaceId: placeId ?? "", distanceSource: placeId ? leg.distanceSource : "" })}
                        />
                        <LegPlaceInput
                          label="Destination"
                          value={leg.destination}
                          placeId={leg.destinationPlaceId}
                          onChange={(value, placeId) => updateLeg(setLegs, index, { destination: value, destinationPlaceId: placeId ?? "", distanceSource: placeId ? leg.distanceSource : "" })}
                        />
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
                      </div>
                    </section>
                    <section className="tex-leg-form-section" aria-label={`Leg ${index + 1} schedule`}>
                      <h5>Schedule</h5>
                      <div className="tex-form-grid">
                    <label>
                      Planned start
                      <input
                        id={`tex-leg-${index}-planned-end-source`}
                        lang="en-GB"
                        type="date"
                        value={leg.plannedStart}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateLeg(setLegs, index, {
                            plannedStart: value,
                            plannedEnd: leg.plannedEnd || value
                          });
                          focusElement(`tex-leg-${index}-planned-end`);
                        }}
                      />
                    </label>
                    <label>
                      Planned end
                      <input
                        id={`tex-leg-${index}-planned-end`}
                        lang="en-GB"
                        type="date"
                        value={leg.plannedEnd}
                        onChange={(event) => updateLeg(setLegs, index, { plannedEnd: event.target.value })}
                      />
                    </label>
                    <label>
                      Actual start
                      <input
                        lang="en-GB"
                        type="date"
                        value={leg.actualStart}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateLeg(setLegs, index, {
                            actualStart: value,
                            actualEnd: leg.actualEnd || value
                          });
                          focusElement(`tex-leg-${index}-actual-end`);
                        }}
                      />
                    </label>
                    <label>
                      Actual end
                      <input
                        id={`tex-leg-${index}-actual-end`}
                        lang="en-GB"
                        type="date"
                        value={leg.actualEnd}
                        onChange={(event) => updateLeg(setLegs, index, { actualEnd: event.target.value })}
                      />
                    </label>
                      </div>
                    </section>
                    <section className="tex-leg-form-section" aria-label={`Leg ${index + 1} distance and budget`}>
                      <h5>Distance and budget</h5>
                      <div className="tex-form-grid">
                    <label>
                      Outbound distance km
                      <input
                        inputMode="decimal"
                        value={leg.distanceKm}
                        onChange={(event) => updateLegDistance(setLegs, index, event.target.value)}
                      />
                    </label>
                    <label>
                      Duration
                      <input value={durationLabel(leg.durationSeconds)} disabled placeholder="Estimated" />
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
                    <label>
                      Distance source
                      <input value={leg.distanceSource} disabled placeholder="Manual or Google Maps" />
                    </label>
                      </div>
                    </section>
                  </div>
                  <div className="tex-action-bar tex-leg-quick-actions">
                    <button
                      type="button"
                      className="tex-secondary-button"
                      disabled={estimatingLegIndex === index || !leg.origin.trim() || !leg.destination.trim()}
                      onClick={() => estimateLeg(index)}
                    >
                      {estimatingLegIndex === index ? "Estimating..." : "Estimate"}
                    </button>
                    <label className="tex-checkbox-row">
                      <input
                        type="checkbox"
                        checked={leg.isReturnTrip}
                        onChange={(event) => updateLegReturnToggle(setLegs, index, event.target.checked)}
                      />
                      Return to origin
                    </label>
                  </div>
                  <label className="tex-wide-label">
                    Notes
                    <input value={leg.notes} onChange={(event) => updateLeg(setLegs, index, { notes: event.target.value })} />
                  </label>
                  <footer className="tex-action-bar tex-leg-row-actions">
                    <button className="tex-secondary-button" type="button" disabled={index === 0} onClick={() => moveLeg(index, -1)}>
                      Move up
                    </button>
                    <button className="tex-secondary-button" type="button" disabled={index === legs.length - 1} onClick={() => moveLeg(index, 1)}>
                      Move down
                    </button>
                    <button className="tex-secondary-button" type="button" onClick={() => removeLeg(index)}>
                      Remove
                    </button>
                  </footer>
                </article>
              ))}
            </div>

            <div className="tex-hero-actions tex-leg-drawer-actions">
              <button type="button" className="tex-secondary-button" onClick={addLeg}>
                Add leg
              </button>
              <button type="button" className="tex-primary-button" disabled={legsSaving || legs.length === 0} onClick={saveLegs}>
                {legsSaving ? "Saving..." : "Save legs"}
              </button>
            </div>
            {legsNotice ? <p className="tex-notice">{legsNotice}</p> : null}
            {legsError ? <p className="tex-error">{legsError}</p> : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function PlaceSuggestionList({
  suggestions,
  onSelect
}: {
  suggestions: PlaceSuggestion[];
  onSelect: (suggestion: PlaceSuggestion) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="tex-place-suggestions">
      {suggestions.map((suggestion) => (
        <button key={suggestion.placeId} type="button" onClick={() => onSelect(suggestion)}>
          {suggestion.text}
        </button>
      ))}
    </div>
  );
}

function LegPlaceInput({
  label,
  value,
  placeId,
  onChange
}: {
  label: string;
  value: string;
  placeId: string;
  onChange: (value: string, placeId: string | null) => void;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (placeId || value.trim().length < 3) {
      setSuggestions([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const places = await loadPlaceSuggestions(value);
        if (!cancelled) {
          setSuggestions(places);
          setIsOpen(places.length > 0);
          setSearchError(places.length === 0 ? "No Google Places matches found." : null);
        }
      } catch (caught) {
        if (!cancelled) {
          setSuggestions([]);
          setSearchError(errorMessage(caught));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [placeId, value]);

  return (
    <div className="tex-place-field">
      <label>
        {label}
        <input
          value={value}
          placeholder="Search Google Maps"
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onChange={(event) => onChange(event.target.value, null)}
        />
      </label>
      {isLoading ? <p className="tex-field-hint">Searching Google Maps...</p> : null}
      {placeId ? <p className="tex-field-hint">Google place selected</p> : null}
      {searchError ? <p className="tex-error">{searchError}</p> : null}
      {isOpen ? (
        <PlaceSuggestionList
          suggestions={suggestions}
          onSelect={(suggestion) => {
            onChange(suggestion.text, suggestion.placeId);
            setSuggestions([]);
            setIsOpen(false);
          }}
        />
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
              <button type="button" onClick={() => onLegs(trip)}>
                Manage legs
              </button>
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
    originPlaceId: leg.originPlaceId ?? "",
    destination: leg.destination,
    destinationPlaceId: leg.destinationPlaceId ?? "",
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
    distanceSource: leg.distanceSource ?? "",
    routePolyline: leg.routePolyline ?? "",
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
    originPlaceId: leg.originPlaceId || null,
    destination: leg.destination,
    destinationPlaceId: leg.destinationPlaceId || null,
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
    distanceSource: leg.distanceSource || null,
    routePolyline: leg.routePolyline || null,
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

function durationLabel(value: string) {
  const seconds = readOptionalNumber(value);

  if (!seconds || seconds <= 0) {
    return "";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (!hours) {
    return `${minutes} min`;
  }

  return `${hours}h ${minutes}m`;
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

async function loadPlaceSuggestions(value: string) {
  if (value.trim().length < 3) {
    return [];
  }

  const response = await texFetch<{ configured?: boolean; places: PlaceSuggestion[] }>(`/places?input=${encodeURIComponent(value)}`);

  if (response.configured === false) {
    throw new Error("Google Places is not configured for this deployment.");
  }

  return response.places;
}

function focusDateInput(ref: RefObject<HTMLInputElement | null>) {
  window.setTimeout(() => ref.current?.focus(), 0);
}

function focusElement(id: string) {
  window.setTimeout(() => document.getElementById(id)?.focus(), 0);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
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
