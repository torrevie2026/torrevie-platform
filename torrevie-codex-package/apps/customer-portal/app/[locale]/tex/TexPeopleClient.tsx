"use client";

import { useMemo, useState } from "react";
import type { TexEmployeeProfile, TexManagerUser, TexTeam } from "../../../lib/tex";

type TexPeopleClientProps = {
  adminUsersHref: string;
  canManage: boolean;
  initialEmployees: TexEmployeeProfile[];
  initialManagerUsers: TexManagerUser[];
  initialTeams: TexTeam[];
};

type EmployeeForm = {
  name: string;
  phoneNumber: string;
  department: string;
  monthlySalary: string;
  managerUserId: string;
  submissionFrequency: TexEmployeeProfile["submissionFrequency"];
  isActive: boolean;
};

type TeamForm = {
  name: string;
  description: string;
  managerEmployeeProfileId: string;
  memberEmployeeProfileIds: string[];
};

const emptyEmployeeForm: EmployeeForm = {
  name: "",
  phoneNumber: "",
  department: "",
  monthlySalary: "",
  managerUserId: "",
  submissionFrequency: "realtime",
  isActive: true
};

const emptyTeamForm: TeamForm = {
  name: "",
  description: "",
  managerEmployeeProfileId: "",
  memberEmployeeProfileIds: []
};

export function TexPeopleClient({
  adminUsersHref,
  canManage,
  initialEmployees,
  initialManagerUsers,
  initialTeams
}: TexPeopleClientProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [teams, setTeams] = useState(initialTeams);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive).length,
    [employees]
  );
  const departmentCount = useMemo(
    () => new Set(employees.map((employee) => employee.department).filter(Boolean)).size,
    [employees]
  );
  const linkedUserCount = useMemo(
    () => employees.filter((employee) => Boolean(employee.userId)).length,
    [employees]
  );
  const editingEmployee = employees.find((employee) => employee.id === editingEmployeeId) ?? null;
  const activeEmployeeOptions = employees.filter((employee) => employee.isActive);
  const editingTeam = teams.find((team) => team.id === editingTeamId) ?? null;

  function editEmployee(employee: TexEmployeeProfile) {
    setEditingEmployeeId(employee.id);
    setForm({
      name: employee.name,
      phoneNumber: employee.phoneNumber,
      department: employee.department ?? "",
      monthlySalary: employee.monthlySalary > 0 ? String(employee.monthlySalary) : "",
      managerUserId: employee.managerUserId ?? "",
      submissionFrequency: employee.submissionFrequency,
      isActive: employee.isActive
    });
    setNotice(null);
    setError(null);
  }

  function resetForm() {
    setEditingEmployeeId(null);
    setForm(emptyEmployeeForm);
  }

  function editTeam(team: TexTeam) {
    setEditingTeamId(team.id);
    setTeamForm({
      name: team.name,
      description: team.description ?? "",
      managerEmployeeProfileId: team.managerEmployeeProfileId ?? "",
      memberEmployeeProfileIds: team.memberEmployeeProfileIds
    });
    setNotice(null);
    setError(null);
  }

  function resetTeamForm() {
    setEditingTeamId(null);
    setTeamForm(emptyTeamForm);
  }

  async function refreshPeople() {
    const result = await texFetch<{
      employeeProfiles?: TexEmployeeProfile[];
      employees?: TexEmployeeProfile[];
      teams?: TexTeam[];
    }>("/people");
    setEmployees(result.employeeProfiles ?? result.employees ?? []);
    setTeams(result.teams ?? []);
  }

  async function saveEmployee() {
    setBusy("employee");
    setNotice(null);
    setError(null);

    try {
      const path = editingEmployeeId
        ? `/people/employees/${editingEmployeeId}`
        : "/people/employees";
      const method = editingEmployeeId ? "PATCH" : "POST";
      const response = await texFetch<{ employee: TexEmployeeProfile }>(path, {
        method,
        body: JSON.stringify({
          ...form,
          monthlySalary: form.monthlySalary ? Number(form.monthlySalary) : 0,
          managerUserId: form.managerUserId || null
        })
      });

      setEmployees((current) => {
        const exists = current.some((employee) => employee.id === response.employee.id);
        return exists
          ? current.map((employee) =>
              employee.id === response.employee.id ? response.employee : employee
            )
          : [...current, response.employee].sort((a, b) => a.name.localeCompare(b.name));
      });
      setNotice(editingEmployeeId ? "Employee updated." : "Employee added.");
      resetForm();
      await refreshPeople();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function deleteEmployee(employee: TexEmployeeProfile) {
    setBusy(employee.id);
    setNotice(null);
    setError(null);

    try {
      await texFetch(`/people/employees/${employee.id}`, { method: "DELETE" });
      setEmployees((current) => current.filter((item) => item.id !== employee.id));
      setNotice("Employee removed.");
      if (editingEmployeeId === employee.id) {
        resetForm();
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function saveTeam() {
    setBusy("team");
    setNotice(null);
    setError(null);

    try {
      const path = editingTeamId ? `/people/teams/${editingTeamId}` : "/people/teams";
      const method = editingTeamId ? "PATCH" : "POST";
      const response = await texFetch<{ team: TexTeam }>(path, {
        method,
        body: JSON.stringify({
          ...teamForm,
          managerEmployeeProfileId: teamForm.managerEmployeeProfileId || null
        })
      });

      setTeams((current) => {
        const exists = current.some((team) => team.id === response.team.id);
        return exists
          ? current.map((team) => (team.id === response.team.id ? response.team : team))
          : [...current, response.team].sort((a, b) => a.name.localeCompare(b.name));
      });
      setNotice(editingTeamId ? "Team updated." : "Team added.");
      resetTeamForm();
      await refreshPeople();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function deleteTeam(team: TexTeam) {
    setBusy(team.id);
    setNotice(null);
    setError(null);

    try {
      await texFetch(`/people/teams/${team.id}`, { method: "DELETE" });
      setTeams((current) => current.filter((item) => item.id !== team.id));
      setNotice("Team removed.");
      if (editingTeamId === team.id) {
        resetTeamForm();
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tex-people-workspace" aria-labelledby="tex-people-title">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">People</p>
          <h2 id="tex-people-title">TEX employee records</h2>
          <p>
            Maintain WhatsApp expense submitters inside the shared tenant boundary. Web login,
            roles, and invitations stay with the platform user administration module.
          </p>
        </div>
        <a className="tex-secondary-link" href={adminUsersHref}>
          Manage web users
        </a>
      </header>

      <div className="tex-people-summary" aria-label="People summary">
        <article>
          <span>Active</span>
          <strong>{activeEmployees}</strong>
        </article>
        <article>
          <span>Departments</span>
          <strong>{departmentCount}</strong>
        </article>
        <article>
          <span>Linked users</span>
          <strong>{linkedUserCount}</strong>
        </article>
      </div>

      {notice ? <p className="tex-success">{notice}</p> : null}
      {error ? <p className="tex-error">{error}</p> : null}

      <div className="tex-people-grid">
        <section className="tex-form-panel" aria-labelledby="tex-people-list-title">
          <h3 id="tex-people-list-title">Employees</h3>
          {employees.length ? (
            <div className="tex-people-list">
              {employees.map((employee) => (
                <article
                  className={employee.isActive ? "tex-people-row" : "tex-people-row tex-muted-row"}
                  key={employee.id}
                >
                  <span>
                    <strong>{employee.name}</strong>
                    <small>
                      {employee.department || "No department"} · {employee.phoneNumber}
                    </small>
                    <small>
                      Salary{" "}
                      {employee.monthlySalary > 0
                        ? `${employee.monthlySalary.toLocaleString()} AED`
                        : "not set"}{" "}
                      - {submissionFrequencyLabel(employee.submissionFrequency)}
                    </small>
                    <small>
                      Manager{" "}
                      {employee.managerName ||
                        employee.managerEmail ||
                        managerUserLabel(initialManagerUsers, employee.managerUserId) ||
                        "not assigned"}
                    </small>
                    <small>{employee.userId ? "Linked to platform user" : "WhatsApp only"}</small>
                  </span>
                  <b>{employee.isActive ? "Active" : "Inactive"}</b>
                  {canManage ? (
                    <div className="tex-row-actions">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => editEmployee(employee)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => deleteEmployee(employee)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="tex-empty-state">No TEX employees have been registered yet.</p>
          )}
        </section>

        <section className="tex-form-panel" aria-labelledby="tex-team-list-title">
          <h3 id="tex-team-list-title">Teams</h3>
          {teams.length ? (
            <div className="tex-people-list">
              {teams.map((team) => (
                <article className="tex-people-row" key={team.id}>
                  <span>
                    <strong>{team.name}</strong>
                    <small>{team.description || "No description"}</small>
                    <small>Manager {team.managerName || "not assigned"}</small>
                    <small>
                      {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
                      {team.memberNames.length ? ` - ${team.memberNames.join(", ")}` : ""}
                    </small>
                  </span>
                  {canManage ? (
                    <div className="tex-row-actions">
                      <button type="button" disabled={busy !== null} onClick={() => editTeam(team)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => deleteTeam(team)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="tex-empty-state">No TEX teams have been configured yet.</p>
          )}
        </section>

        <section className="tex-form-panel" aria-labelledby="tex-people-form-title">
          <h3 id="tex-people-form-title">
            {editingEmployee ? `Edit ${editingEmployee.name}` : "Add employee"}
          </h3>
          <div className="tex-form-grid">
            <label>
              Name
              <input
                value={form.name}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              WhatsApp phone
              <input
                inputMode="tel"
                value={form.phoneNumber}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
              />
            </label>
            <label>
              Department
              <input
                value={form.department}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, department: event.target.value })}
              />
            </label>
            <label>
              Monthly salary
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlySalary}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, monthlySalary: event.target.value })}
              />
            </label>
            <label>
              Approval manager
              <select
                value={form.managerUserId}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, managerUserId: event.target.value })}
              >
                <option value="">No assigned manager</option>
                {initialManagerUsers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {managerLabel(manager)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Submission cadence
              <select
                value={form.submissionFrequency}
                disabled={!canManage}
                onChange={(event) =>
                  setForm({
                    ...form,
                    submissionFrequency: event.target
                      .value as TexEmployeeProfile["submissionFrequency"]
                  })
                }
              >
                <option value="realtime">Realtime</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="tex-toggle-label">
              <input
                type="checkbox"
                checked={form.isActive}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Active
            </label>
          </div>
          {canManage ? (
            <div className="tex-panel-actions">
              <button type="button" disabled={busy !== null} onClick={saveEmployee}>
                {editingEmployee ? "Save employee" : "Add employee"}
              </button>
              {editingEmployee ? (
                <button type="button" disabled={busy !== null} onClick={resetForm}>
                  Cancel
                </button>
              ) : null}
            </div>
          ) : (
            <p className="tex-empty-state">
              You need TEX people management permission to edit records.
            </p>
          )}
        </section>

        <section className="tex-form-panel" aria-labelledby="tex-team-form-title">
          <h3 id="tex-team-form-title">{editingTeam ? `Edit ${editingTeam.name}` : "Add team"}</h3>
          <div className="tex-form-grid">
            <label>
              Team name
              <input
                value={teamForm.name}
                disabled={!canManage}
                onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })}
              />
            </label>
            <label>
              Description
              <input
                value={teamForm.description}
                disabled={!canManage}
                onChange={(event) => setTeamForm({ ...teamForm, description: event.target.value })}
              />
            </label>
            <label>
              Team manager
              <select
                value={teamForm.managerEmployeeProfileId}
                disabled={!canManage}
                onChange={(event) =>
                  setTeamForm({ ...teamForm, managerEmployeeProfileId: event.target.value })
                }
              >
                <option value="">No assigned manager</option>
                {activeEmployeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="tex-checkbox-group">
              <legend>Members</legend>
              {activeEmployeeOptions.length ? (
                activeEmployeeOptions.map((employee) => (
                  <label key={employee.id} className="tex-toggle-label">
                    <input
                      type="checkbox"
                      checked={teamForm.memberEmployeeProfileIds.includes(employee.id)}
                      disabled={!canManage}
                      onChange={() =>
                        setTeamForm({
                          ...teamForm,
                          memberEmployeeProfileIds: toggleId(
                            teamForm.memberEmployeeProfileIds,
                            employee.id
                          )
                        })
                      }
                    />
                    {employee.name}
                  </label>
                ))
              ) : (
                <p className="tex-empty-state">Add active employees before assigning members.</p>
              )}
            </fieldset>
          </div>
          {canManage ? (
            <div className="tex-panel-actions">
              <button type="button" disabled={busy !== null} onClick={saveTeam}>
                {editingTeam ? "Save team" : "Add team"}
              </button>
              {editingTeam ? (
                <button type="button" disabled={busy !== null} onClick={resetTeamForm}>
                  Cancel
                </button>
              ) : null}
            </div>
          ) : (
            <p className="tex-empty-state">
              You need TEX people management permission to edit teams.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

function submissionFrequencyLabel(value: TexEmployeeProfile["submissionFrequency"]) {
  switch (value) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    default:
      return "Realtime";
  }
}

function managerLabel(manager: TexManagerUser) {
  return manager.displayName ? `${manager.displayName} (${manager.email})` : manager.email;
}

function managerUserLabel(managers: TexManagerUser[], managerUserId: string | null) {
  const manager = managers.find((candidate) => candidate.id === managerUserId);
  return manager ? managerLabel(manager) : null;
}

function toggleId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

async function texFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/tex${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const body = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "TEX request failed.");
  }

  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "TEX request failed.";
}
