"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type ObjectStatus = "active" | "inactive" | "completed";

type ObjectRow = {
  id: string;
  name: string;
  status: ObjectStatus;
  created_at: string;
};

type MachineRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  hourly_rate?: number | null;
  machine_type?: string | null;
  serial_number?: string | null;
};

type DriverRow = {
  user_id: string;
  username: string | null;
  full_name: string;
  default_machine: string | null;
  hourly_wage: number | null;
  is_active: boolean;
  created_at: string;
};

async function isAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

function normName(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function toNumOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function AdminPage() {
  const [meName, setMeName] = useState("");
  const [admin, setAdmin] = useState<boolean | null>(null);

  const [objects, setObjects] = useState<ObjectRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);

  const [newObject, setNewObject] = useState("");
  const [newMachine, setNewMachine] = useState("");
  const [newMachineHourlyRate, setNewMachineHourlyRate] = useState("");
  const [newMachineType, setNewMachineType] = useState("");
  const [newMachineSerialNumber, setNewMachineSerialNumber] = useState("");

  const [newDriverUserId, setNewDriverUserId] = useState("");
  const [newDriverUsername, setNewDriverUsername] = useState("");
  const [newDriverFullName, setNewDriverFullName] = useState("");
  const [newDriverDefaultMachine, setNewDriverDefaultMachine] = useState("");
  const [newDriverHourlyWage, setNewDriverHourlyWage] = useState("");

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }
      setMeName(me.firstName || me.email || "");

      const ok = await isAdmin();
      setAdmin(ok);

      if (ok) await loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setMsg("");
    setBusy(true);

    const [o, m, d] = await Promise.all([
      supabase.from("objects").select("id,name,status,created_at").order("status", { ascending: true }).order("name", { ascending: true }),
      supabase.from("machines").select("*").order("is_active", { ascending: false }).order("name", { ascending: true }),
      supabase
        .from("driver_profiles")
        .select("user_id,username,full_name,default_machine,hourly_wage,is_active,created_at")
        .order("is_active", { ascending: false })
        .order("full_name", { ascending: true }),
    ]);

    setBusy(false);

    if (o.error) setMsg("Fehler Objekte laden: " + o.error.message);
    if (m.error) setMsg((prev) => (prev ? prev + "\n" : "") + "Fehler Maschinen laden: " + m.error.message);
    if (d.error) setMsg((prev) => (prev ? prev + "\n" : "") + "Fehler Fahrer laden: " + d.error.message);

    setObjects((o.data as any) ?? []);
    setMachines((m.data as any) ?? []);

    const driverData = ((d.data as any) ?? []) as DriverRow[];

    driverData.sort((a, b) => {
      const getLastName = (name: string) => {
        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        return parts.length === 0 ? "" : parts[parts.length - 1].toLowerCase();
      };

      const cmp = getLastName(a.full_name).localeCompare(getLastName(b.full_name), "de", { sensitivity: "base" });
      if (cmp !== 0) return cmp;

      return a.full_name.localeCompare(b.full_name, "de", { sensitivity: "base" });
    });

    setDrivers(driverData);
  }

  async function add(kind: "objects" | "machines") {
    const raw = kind === "objects" ? newObject : newMachine;
    const name = normName(raw);
    if (!name) return;

    setMsg("Speichern...");
    setBusy(true);

    const payload: any =
      kind === "objects"
        ? { name, status: "active" as ObjectStatus }
        : { name };

    if (kind === "machines") {
      payload.hourly_rate = toNumOrNull(newMachineHourlyRate);
      payload.machine_type = newMachineType || null;
      payload.serial_number = normName(newMachineSerialNumber) || null;
    }

    const { error } = await supabase.from(kind).insert(payload);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    if (kind === "objects") {
      setNewObject("");
    } else {
      setNewMachine("");
      setNewMachineHourlyRate("");
      setNewMachineType("");
      setNewMachineSerialNumber("");
    }

    setMsg("✅ Gespeichert");
    await loadAll();
  }

  async function setObjectStatus(row: ObjectRow, status: ObjectStatus) {
    if (status === row.status) return;

    if (status === "completed") {
      const ok = confirm(
        `Los wirklich abschließen?\n\n${row.name}\n\n` +
          "Das Los wird danach:\n" +
          "• beim Fahrer nicht mehr auswählbar sein\n" +
          "• auf der Kontrollseite ausgeblendet\n" +
          "• aus allen Exporten entfernt\n\n" +
          "Bereits gespeicherte Daten bleiben in der Datenbank erhalten."
      );

      if (!ok) return;
    }

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("objects").update({ status }).eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler Objektstatus: " + error.message);
      return;
    }

    setMsg("✅ Objektstatus aktualisiert");
    await loadAll();
  }

  async function toggleMachineActive(row: MachineRow) {
    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("machines").update({ is_active: !row.is_active }).eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Aktualisiert");
    await loadAll();
  }

  async function rename(kind: "objects" | "machines", row: ObjectRow | MachineRow) {
    const next = normName(prompt("Neuer Name:", row.name) || "");
    if (!next || next === row.name) return;

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from(kind).update({ name: next }).eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Umbenannt");
    await loadAll();
  }

  async function remove(kind: "objects" | "machines", row: ObjectRow | MachineRow) {
    if (!confirm(`Wirklich löschen?\n\n${row.name}`)) return;

    setMsg("Löschen...");
    setBusy(true);

    const { error } = await supabase.from(kind).delete().eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Gelöscht");
    await loadAll();
  }

  async function setMachineHourlyRate(row: MachineRow) {
    const current = row.hourly_rate ?? "";
    const raw = prompt("Stundenpreis Maschine:", String(current).replace(".", ",")) || "";
    const next = toNumOrNull(raw);

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("machines").update({ hourly_rate: next }).eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Stundenpreis gespeichert");
    await loadAll();
  }

  async function setMachineType(row: MachineRow, machineType: string) {
    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("machines").update({ machine_type: machineType || null }).eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Maschinentyp gespeichert");
    await loadAll();
  }

  async function setMachineSerialNumber(row: MachineRow) {
    const next = normName(prompt("Seriennummer:", row.serial_number ?? "") || "");

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("machines").update({ serial_number: next || null }).eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Seriennummer gespeichert");
    await loadAll();
  }

  async function addDriver() {
    const user_id = normName(newDriverUserId);
    const full_name = normName(newDriverFullName);
    const username = normName(newDriverUsername);
    const default_machine = normName(newDriverDefaultMachine);
    const hourly_wage = toNumOrNull(newDriverHourlyWage);

    if (!user_id) return setMsg("Bitte user_id (UUID) eingeben.");
    if (!full_name) return setMsg("Bitte Name eingeben.");

    setMsg("Speichern...");
    setBusy(true);

    const payload: any = {
      user_id,
      full_name,
      username: username || null,
      default_machine: default_machine || null,
      hourly_wage,
      is_active: true,
    };

    const { error } = await supabase.from("driver_profiles").insert(payload);

    setBusy(false);
    if (error) {
      setMsg("Fehler Fahrer speichern: " + error.message);
      return;
    }

    setNewDriverUserId("");
    setNewDriverFullName("");
    setNewDriverUsername("");
    setNewDriverDefaultMachine("");
    setNewDriverHourlyWage("");

    setMsg("✅ Fahrer gespeichert");
    await loadAll();
  }

  async function toggleDriverActive(row: DriverRow) {
    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("driver_profiles").update({ is_active: !row.is_active }).eq("user_id", row.user_id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Aktualisiert");
    await loadAll();
  }

  async function renameDriver(row: DriverRow) {
    const next = normName(prompt("Neuer Name:", row.full_name) || "");
    if (!next || next === row.full_name) return;

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("driver_profiles").update({ full_name: next }).eq("user_id", row.user_id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Umbenannt");
    await loadAll();
  }

  async function setDriverUsername(row: DriverRow) {
    const next = normName(prompt("Neuer Benutzername (optional):", row.username ?? "") || "");

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("driver_profiles").update({ username: next ? next : null }).eq("user_id", row.user_id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Aktualisiert");
    await loadAll();
  }

  async function setDriverDefaultMachine(row: DriverRow, machine: string) {
    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("driver_profiles").update({ default_machine: machine ? machine : null }).eq("user_id", row.user_id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Standard-Maschine gesetzt");
    await loadAll();
  }

  async function setDriverHourlyWage(row: DriverRow) {
    const current = row.hourly_wage ?? "";
    const raw = prompt("Stundenlohn Fahrer:", String(current).replace(".", ",")) || "";
    const next = toNumOrNull(raw);

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from("driver_profiles").update({ hourly_wage: next }).eq("user_id", row.user_id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Stundenlohn gespeichert");
    await loadAll();
  }

  async function removeDriver(row: DriverRow) {
    if (!confirm(`Wirklich Fahrer-Profil löschen?\n\n${row.full_name}\n\nHinweis: Das löscht NICHT automatisch den Auth-User.`)) return;

    setMsg("Löschen...");
    setBusy(true);

    const { error } = await supabase.from("driver_profiles").delete().eq("user_id", row.user_id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Fahrer-Profil gelöscht");
    await loadAll();
  }

  const activeObjects = useMemo(() => objects.filter((x) => x.status === "active"), [objects]);
  const inactiveObjects = useMemo(() => objects.filter((x) => x.status === "inactive"), [objects]);
  const completedObjects = useMemo(() => objects.filter((x) => x.status === "completed"), [objects]);
  const activeMachines = useMemo(() => machines.filter((x) => x.is_active), [machines]);
  const activeDrivers = useMemo(() => drivers.filter((x) => x.is_active), [drivers]);

  if (admin === null) {
    return (
      <main style={{ maxWidth: 980, margin: "24px auto", padding: 12 }}>
        <h1 style={{ marginTop: 0 }}>Admin</h1>
        <p>Lade…</p>
      </main>
    );
  }

  if (!admin) {
    return (
      <main style={{ maxWidth: 980, margin: "24px auto", padding: 12 }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0 }}>Admin</h1>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Angemeldet als: <b>{meName || "…"}</b>
            </div>
          </div>
          <Link href="/app">
            <button style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>Zur Übersicht</button>
          </Link>
        </header>

        <p style={{ marginTop: 16, color: "crimson" }}>❌ Du bist kein Admin.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "24px auto", padding: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Angemeldet als: <b>{meName || "…"}</b>
          </div>
        </div>

<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
  <Link href="/admin/control">
    <button className="topBtn">Kontrolle</button>
  </Link>

  <Link href="/admin/export">
    <button className="topBtn">Export</button>
  </Link>

  <Link href="/admin/komatsu">
    <button className="topBtn">Komatsu</button>
  </Link>

  <Link href="/app">
    <button className="topBtn">Zur Übersicht</button>
  </Link>

  <button onClick={loadAll} disabled={busy} className="topBtn">
    {busy ? "…" : "Neu laden"}
  </button>
</div>
      </header>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        <details className="adminSection" open>
          <summary className="sectionSummary">
            <span className="plus">＋</span>
            <span>Objekte</span>
            <span className="count">
              Aktiv: {activeObjects.length} · Deaktiviert: {inactiveObjects.length} · Abgeschlossen: {completedObjects.length} · Gesamt: {objects.length}
            </span>
          </summary>

          <div className="sectionInner">
            <div className="inputRow">
              <input value={newObject} onChange={(e) => setNewObject(e.target.value)} placeholder="Neues Objekt, z.B. Holzpolter 17" className="input" />
              <button type="button" onClick={() => add("objects")} disabled={busy} className="primaryBtn">
                Hinzufügen
              </button>
            </div>

            <div className="list">
              {objects.map((o) => (
                <div key={o.id} className={`listRow objectRow object-${o.status}`}>
                  <div style={{ minWidth: 220 }}>
                    <b>{o.name}</b>
                    <span className={`statusBadge status-${o.status}`}>
                      {o.status === "active"
                        ? "🟢 Aktiv"
                        : o.status === "inactive"
                          ? "🟡 Deaktiviert"
                          : "⚫ Abgeschlossen"}
                    </span>
                  </div>

                  <div className="actions">
                    <select
                      value={o.status}
                      onChange={(e) => setObjectStatus(o, e.target.value as ObjectStatus)}
                      disabled={busy}
                      className="smallSelect statusSelect"
                    >
                      <option value="active">🟢 Aktiv</option>
                      <option value="inactive">🟡 Deaktiviert</option>
                      <option value="completed">⚫ Abgeschlossen</option>
                    </select>

                    <button type="button" onClick={() => rename("objects", o)} disabled={busy} className="smallBtn">
                      Umbenennen
                    </button>
                    <button type="button" onClick={() => remove("objects", o)} disabled={busy} className="smallBtn dangerBtn">
                      Löschen
                    </button>
                  </div>
                </div>
              ))}

              {objects.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine Objekte angelegt.</div>}
            </div>
          </div>
        </details>

        <details className="adminSection">
          <summary className="sectionSummary">
            <span className="plus">＋</span>
            <span>Fahrer</span>
            <span className="count">
              Aktiv: {activeDrivers.length} / Gesamt: {drivers.length}
            </span>
          </summary>

          <div className="sectionInner">
            <div style={{ opacity: 0.75, marginBottom: 10 }}>user_id bekommst du im Supabase Dashboard unter Auth → Users.</div>

            <div style={{ display: "grid", gap: 10 }}>
              <input value={newDriverUserId} onChange={(e) => setNewDriverUserId(e.target.value)} placeholder="user_id (UUID) aus Auth Users" className="input" />

              <div className="inputRow">
                <input value={newDriverFullName} onChange={(e) => setNewDriverFullName(e.target.value)} placeholder="Name (Pflicht), z.B. Max Mustermann" className="input" />

                <input value={newDriverUsername} onChange={(e) => setNewDriverUsername(e.target.value)} placeholder="Benutzername (optional)" className="input" />
              </div>

              <div className="inputRow">
                <select value={newDriverDefaultMachine} onChange={(e) => setNewDriverDefaultMachine(e.target.value)} className="input">
                  <option value="">Standard-Maschine (optional) …</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>

                <input value={newDriverHourlyWage} onChange={(e) => setNewDriverHourlyWage(e.target.value)} placeholder="Stundenlohn, z.B. 19,5" inputMode="decimal" className="input" />

                <button type="button" onClick={addDriver} disabled={busy} className="primaryBtn">
                  Fahrer hinzufügen
                </button>
              </div>
            </div>

            <div className="list" style={{ marginTop: 12 }}>
              {drivers.map((d) => (
                <div key={d.user_id} className="listRow">
                  <div style={{ minWidth: 280 }}>
                    <b>{d.full_name}</b> {!d.is_active && <span style={{ color: "crimson", marginLeft: 8 }}>(inaktiv)</span>}
                    <div style={{ opacity: 0.8, marginTop: 4, fontSize: 13 }}>
                      user_id: <code>{d.user_id}</code>
                      {" · "}username: <b>{d.username || <span style={{ opacity: 0.7 }}>(leer)</span>}</b>
                      {" · "}Standard-Maschine: <b>{d.default_machine || <span style={{ opacity: 0.7 }}>(keine)</span>}</b>
                      {" · "}Stundenlohn: <b>{d.hourly_wage ?? <span style={{ opacity: 0.7 }}>(leer)</span>} €/h</b>
                    </div>
                  </div>

                  <div className="actions">
                    <select value={d.default_machine ?? ""} onChange={(e) => setDriverDefaultMachine(d, e.target.value)} disabled={busy} className="smallSelect">
                      <option value="">Standard-Maschine…</option>
                      {machines
                        .filter((x) => x.is_active)
                        .map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                    </select>

                    <button type="button" onClick={() => setDriverHourlyWage(d)} disabled={busy} className="smallBtn">
                      Lohn
                    </button>
                    <button type="button" onClick={() => toggleDriverActive(d)} disabled={busy} className="smallBtn">
                      {d.is_active ? "Deaktivieren" : "Aktivieren"}
                    </button>
                    <button type="button" onClick={() => renameDriver(d)} disabled={busy} className="smallBtn">
                      Umbenennen
                    </button>
                    <button type="button" onClick={() => setDriverUsername(d)} disabled={busy} className="smallBtn">
                      Username
                    </button>
                    <button type="button" onClick={() => removeDriver(d)} disabled={busy} className="smallBtn">
                      Löschen
                    </button>
                  </div>
                </div>
              ))}

              {drivers.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine Fahrer angelegt.</div>}
            </div>
          </div>
        </details>

        <details className="adminSection">
          <summary className="sectionSummary">
            <span className="plus">＋</span>
            <span>Maschinen</span>
            <span className="count">
              Aktiv: {activeMachines.length} / Gesamt: {machines.length}
            </span>
          </summary>

          <div className="sectionInner">
            <div className="inputRow">
              <input value={newMachine} onChange={(e) => setNewMachine(e.target.value)} placeholder="Neue Maschine, z.B. Harvester H1" className="input" />

              <input value={newMachineHourlyRate} onChange={(e) => setNewMachineHourlyRate(e.target.value)} placeholder="Stundenpreis, z.B. 95" inputMode="decimal" className="input" />

              <select value={newMachineType} onChange={(e) => setNewMachineType(e.target.value)} className="input">
                <option value="">Typ…</option>
                <option value="harvester">Harvester</option>
                <option value="forwarder">Forwarder</option>
                <option value="motormanuel">Motormanuel</option>
                <option value="sonstiges">Sonstiges</option>
              </select>

              <input value={newMachineSerialNumber} onChange={(e) => setNewMachineSerialNumber(e.target.value)} placeholder="Seriennummer, z.B. 8550033898" className="input" />

              <button type="button" onClick={() => add("machines")} disabled={busy} className="primaryBtn">
                Hinzufügen
              </button>
            </div>

            <div className="list">
              {machines.map((m) => (
                <div key={m.id} className="listRow">
                  <div style={{ minWidth: 240 }}>
                    <b>{m.name}</b> {!m.is_active && <span style={{ color: "crimson", marginLeft: 8 }}>(inaktiv)</span>}
                    <div style={{ opacity: 0.8, marginTop: 4, fontSize: 13 }}>
                      Stundenpreis: <b>{m.hourly_rate ?? <span style={{ opacity: 0.7 }}>(leer)</span>} €/h</b>
                      {" · "}Typ: <b>{m.machine_type || <span style={{ opacity: 0.7 }}>(leer)</span>}</b>
                      {" · "}Seriennr.: <b>{m.serial_number || <span style={{ opacity: 0.7 }}>(leer)</span>}</b>
                    </div>
                  </div>

                  <div className="actions">
                    <select value={m.machine_type ?? ""} onChange={(e) => setMachineType(m, e.target.value)} disabled={busy} className="smallSelect">
                      <option value="">Typ…</option>
                      <option value="harvester">Harvester</option>
                      <option value="forwarder">Forwarder</option>
                      <option value="motormanuel">Motormanuel</option>
                      <option value="sonstiges">Sonstiges</option>
                    </select>

                    <button type="button" onClick={() => setMachineHourlyRate(m)} disabled={busy} className="smallBtn">
                      Preis
                    </button>

                    <button type="button" onClick={() => setMachineSerialNumber(m)} disabled={busy} className="smallBtn">
                      Seriennr.
                    </button>

                    <button type="button" onClick={() => toggleMachineActive(m)} disabled={busy} className="smallBtn">
                      {m.is_active ? "Deaktivieren" : "Aktivieren"}
                    </button>

                    <button type="button" onClick={() => rename("machines", m)} disabled={busy} className="smallBtn">
                      Umbenennen
                    </button>

                    <button type="button" onClick={() => remove("machines", m)} disabled={busy} className="smallBtn">
                      Löschen
                    </button>
                  </div>
                </div>
              ))}

              {machines.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine Maschinen angelegt.</div>}
            </div>
          </div>
        </details>

        {msg && <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{msg}</pre>}
      </div>

      <style jsx>{`
        .topBtn,
        .smallBtn,
        .primaryBtn {
          border: 1px solid #ddd;
          background: #fff;
          font-weight: 800;
          cursor: pointer;
        }

        .topBtn {
          padding: 10px;
          border-radius: 10px;
        }

        .primaryBtn {
          padding: 12px 14px;
          border-radius: 12px;
          font-weight: 900;
          min-width: 140px;
        }

        .smallBtn {
          padding: 8px 10px;
          border-radius: 10px;
        }

        .adminSection {
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 12px;
          background: #fff;
        }

        .sectionSummary {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 22px;
          font-weight: 900;
          list-style: none;
          user-select: none;
        }

        .sectionSummary::-webkit-details-marker {
          display: none;
        }

        .plus {
          display: inline-block;
          transition: transform 0.12s ease;
          font-size: 22px;
        }

        details[open] .plus {
          transform: rotate(45deg);
        }

        .count {
          margin-left: auto;
          font-size: 14px;
          opacity: 0.7;
          font-weight: 800;
        }

        .sectionInner {
          margin-top: 12px;
        }

        .inputRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .input {
          flex: 1 1 220px;
          padding: 12px;
          font-size: 16px;
          border-radius: 10px;
          border: 1px solid #ddd;
          background: #fff;
          box-sizing: border-box;
        }

        .smallSelect {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid #ddd;
          background: #fff;
          min-width: 170px;
        }

        .list {
          display: grid;
          gap: 8px;
          margin-top: 10px;
        }

        .objectRow {
          transition: opacity 0.12s ease, background 0.12s ease;
        }

        .object-active {
          background: #f6fff8;
          border-color: #b7dfc0;
        }

        .object-inactive {
          background: #fffaf0;
          border-color: #ead28b;
        }

        .object-completed {
          background: #f3f3f3;
          border-color: #cfcfcf;
          opacity: 0.78;
        }

        .statusBadge {
          display: inline-block;
          margin-left: 8px;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
        }

        .status-active {
          background: #dcf7e3;
          border: 1px solid #5ab66e;
          color: #145626;
        }

        .status-inactive {
          background: #fff0b3;
          border: 1px solid #c89a00;
          color: #6f5100;
        }

        .status-completed {
          background: #dedede;
          border: 1px solid #999;
          color: #444;
        }

        .statusSelect {
          min-width: 175px;
          font-weight: 800;
        }

        .dangerBtn {
          color: #a40000;
          border-color: #e0aaaa;
        }

        .listRow {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        @media (max-width: 700px) {
          .sectionSummary {
            font-size: 19px;
          }

          .count {
            width: 100%;
            margin-left: 32px;
          }

          .actions {
            width: 100%;
          }

          .smallBtn,
          .smallSelect {
            flex: 1 1 auto;
          }
        }
      `}</style>
    </main>
  );
}