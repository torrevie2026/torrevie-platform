"use client";

import { useMemo, useState } from "react";
import type { TexEmployeeProfile, TexManagerUser } from "../../../lib/tex";

type TexPeopleClientProps = {
  adminUsersHref: string;
  canManage: boolean;
  initialEmployees: TexEmployeeProfile[];
  initialManagerUsers: TexManagerUser[];
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

const emptyEmployeeForm: EmployeeForm = {
  name: "",
  phoneNumber: "",
  department: "",
  monthlySalary: "",
  managerUserId: "",
  submissionFrequency: "realtime",
  isActive: true
};

export function TexPeopleClient({
  adminUsersHref,
  canManage,
  initialEmployees,
  initialManagerUsers
}: TexPeopleClientProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
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

  async function refreshPeople() {
    const result = await texFetch<{
      employeeProfiles?: TexEmployeeProfile[];
      employees?: TexEmployeeProfile[];
    }>("/people");
    setEmployees(result.employeeProfiles ?? result.employees ?? []);
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
