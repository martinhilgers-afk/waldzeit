"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type Row = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

type DriverRow = {
  user_id: string;
  username: string | null;
  full_name: string;
  default_machine: string | null;
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

export default function AdminPage() {
  const [meName, setMeName] = useState("");
  const [admin, setAdmin] = useState<boolean | null>(null);

  const [objects, setObjects] = useState<Row[]>([]);
  const [machines, setMachines] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);

  const [newObject, setNewObject] = useState("");
  const [newMachine, setNewMachine] = useState("");

  // Fahrer: Neues Profil
  const [newDriverUserId, setNewDriverUserId] = useState("");
  const [newDriverUsername, setNewDriverUsername] = useState("");
  const [newDriverFullName, setNewDriverFullName] = useState("");
  const [newDriverDefaultMachine, setNewDriverDefaultMachine] = useState("");

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

      if (ok) {
        await loadAll();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setMsg("");
    setBusy(true);

    const [o, m, d] = await Promise.all([
      supabase.from("objects").select("*").order("is_active", { ascending: false }).order("name", { ascending: true }),
      supabase.from("machines").select("*").order("is_active", { ascending: false }).order("name", { ascending: true }),
      supabase
        .from("driver_profiles")
        .select("user_id,username,full_name,default_machine,is_active,created_at")
        .order("is_active", { ascending: false })
        .order("full_name", { ascending: true }),
    ]);

    setBusy(false);

    if (o.error) setMsg("Fehler Objekte laden: " + o.error.message);
    if (m.error) setMsg((prev) => (prev ? prev + "\n" : "") + "Fehler Maschinen laden: " + m.error.message);
    if (d.error) setMsg((prev) => (prev ? prev + "\n" : "") + "Fehler Fahrer laden: " + d.error.message);

    setObjects((o.data as any) ?? []);
    setMachines((m.data as any) ?? []);
    setDrivers((d.data as any) ?? []);
  }

  async function add(kind: "objects" | "machines") {
    const raw = kind === "objects" ? newObject : newMachine;
    const name = normName(raw);
    if (!name) return;

    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from(kind).insert({ name });

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    if (kind === "objects") setNewObject("");
    else setNewMachine("");

    setMsg("✅ Gespeichert");
    await loadAll();
  }

  async function toggleActive(kind: "objects" | "machines", row: Row) {
    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase.from(kind).update({ is_active: !row.is_active }).eq("id", row.id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Aktualisiert");
    await loadAll();
  }

  async function rename(kind: "objects" | "machines", row: Row) {
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

  async function remove(kind: "objects" | "machines", row: Row) {
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

  // =========================
  // Fahrer CRUD
  // =========================

  async function addDriver() {
    const user_id = normName(newDriverUserId);
    const full_name = normName(newDriverFullName);
    const username = normName(newDriverUsername);
    const default_machine = normName(newDriverDefaultMachine);

    if (!user_id) return setMsg("Bitte user_id (UUID) eingeben.");
    if (!full_name) return setMsg("Bitte Name eingeben.");

    setMsg("Speichern...");
    setBusy(true);

    const payload: any = {
      user_id,
      full_name,
      username: username || null,
      default_machine: default_machine || null,
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

    setMsg("✅ Fahrer gespeichert");
    await loadAll();
  }

  async function toggleDriverActive(row: DriverRow) {
    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase
      .from("driver_profiles")
      .update({ is_active: !row.is_active })
      .eq("user_id", row.user_id);

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
    // darf leer sein => null
    setMsg("Speichern...");
    setBusy(true);

    const { error } = await supabase
      .from("driver_profiles")
      .update({ username: next ? next : null })
      .eq("user_id", row.user_id);

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

    const { error } = await supabase
      .from("driver_profiles")
      .update({ default_machine: machine ? machine : null })
      .eq("user_id", row.user_id);

    setBusy(false);
    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Standard-Maschine gesetzt");
    await loadAll();
  }

  async function removeDriver(row: DriverRow) {
    if (
      !confirm(
        `Wirklich Fahrer-Profil löschen?\n\n${row.full_name}\n\nHinweis: Das löscht NICHT automatisch den Auth-User.`
      )
    )
      return;

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

  const activeObjects = useMemo(() => objects.filter((x) => x.is_active), [objects]);
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
        <p style={{ opacity: 0.8 }}>
          Admin-Rechte werden über <code>admin_users</code> + <code>public.is_admin()</code> gesteuert.
        </p>
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
          <Link href="/admin/export">
            <button style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>Export</button>
          </Link>

          <Link href="/app">
            <button style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>Zur Übersicht</button>
          </Link>

          <button
            onClick={loadAll}
            disabled={busy}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          >
            {busy ? "…" : "Neu laden"}
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {/* FAHRER */}
        <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Fahrer</h2>

          <div style={{ opacity: 0.75, marginBottom: 10 }}>
            Aktiv: {activeDrivers.length} / Gesamt: {drivers.length}{" "}
            <span style={{ opacity: 0.75 }}>
              (user_id bekommst du im Supabase Dashboard unter Auth → Users)
            </span>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={newDriverUserId}
              onChange={(e) => setNewDriverUserId(e.target.value)}
              placeholder="user_id (UUID) aus Auth Users"
              style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={newDriverFullName}
                onChange={(e) => setNewDriverFullName(e.target.value)}
                placeholder="Name (Pflicht), z.B. Max Mustermann"
                style={{ flex: "1 1 320px", padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ddd" }}
              />

              <input
                value={newDriverUsername}
                onChange={(e) => setNewDriverUsername(e.target.value)}
                placeholder="Benutzername (optional)"
                style={{ flex: "1 1 220px", padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select
                value={newDriverDefaultMachine}
                onChange={(e) => setNewDriverDefaultMachine(e.target.value)}
                style={{
                  flex: "1 1 360px",
                  padding: 12,
                  fontSize: 16,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                }}
              >
                <option value="">Standard-Maschine (optional) …</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={addDriver}
                disabled={busy}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  fontWeight: 900,
                  minWidth: 160,
                }}
              >
                Fahrer hinzufügen
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {drivers.map((d) => (
              <div
                key={d.user_id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 260 }}>
                  <b>{d.full_name}</b>{" "}
                  {!d.is_active && <span style={{ color: "crimson", marginLeft: 8 }}>(inaktiv)</span>}
                  <div style={{ opacity: 0.8, marginTop: 4, fontSize: 13 }}>
                    user_id: <code>{d.user_id}</code>
                    {d.username ? (
                      <>
                        {" "}
                        · username: <b>{d.username}</b>
                      </>
                    ) : (
                      <>
                        {" "}
                        · username: <span style={{ opacity: 0.7 }}>(leer)</span>
                      </>
                    )}
                    {" · "}
                    Standard-Maschine:{" "}
                    <b>{d.default_machine ? d.default_machine : <span style={{ opacity: 0.7 }}>(keine)</span>}</b>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={d.default_machine ?? ""}
                    onChange={(e) => setDriverDefaultMachine(d, e.target.value)}
                    disabled={busy}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      minWidth: 220,
                    }}
                  >
                    <option value="">Standard-Maschine…</option>
                    {machines
                      .filter((x) => x.is_active)
                      .map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => toggleDriverActive(d)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    {d.is_active ? "Deaktivieren" : "Aktivieren"}
                  </button>

                  <button
                    type="button"
                    onClick={() => renameDriver(d)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    Umbenennen
                  </button>

                  <button
                    type="button"
                    onClick={() => setDriverUsername(d)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    Username
                  </button>

                  <button
                    type="button"
                    onClick={() => removeDriver(d)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))}

            {drivers.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine Fahrer angelegt.</div>}
          </div>
        </section>

        {/* OBJEKTE */}
        <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Objekte</h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={newObject}
              onChange={(e) => setNewObject(e.target.value)}
              placeholder="Neues Objekt, z.B. Holzpolter 17"
              style={{
                flex: "1 1 360px",
                padding: 12,
                fontSize: 16,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
            />
            <button
              type="button"
              onClick={() => add("objects")}
              disabled={busy}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #ddd",
                fontWeight: 900,
                minWidth: 140,
              }}
            >
              Hinzufügen
            </button>
          </div>

          <div style={{ opacity: 0.75, marginTop: 10 }}>
            Aktiv: {activeObjects.length} / Gesamt: {objects.length}
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {objects.map((o) => (
              <div
                key={o.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 200 }}>
                  <b>{o.name}</b> {!o.is_active && <span style={{ color: "crimson", marginLeft: 8 }}>(inaktiv)</span>}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => toggleActive("objects", o)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    {o.is_active ? "Deaktivieren" : "Aktivieren"}
                  </button>

                  <button
                    type="button"
                    onClick={() => rename("objects", o)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    Umbenennen
                  </button>

                  <button
                    type="button"
                    onClick={() => remove("objects", o)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))}

            {objects.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine Objekte angelegt.</div>}
          </div>
        </section>

        {/* MASCHINEN */}
        <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Maschinen</h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={newMachine}
              onChange={(e) => setNewMachine(e.target.value)}
              placeholder="Neue Maschine, z.B. Harvester H1"
              style={{
                flex: "1 1 360px",
                padding: 12,
                fontSize: 16,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
            />
            <button
              type="button"
              onClick={() => add("machines")}
              disabled={busy}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #ddd",
                fontWeight: 900,
                minWidth: 140,
              }}
            >
              Hinzufügen
            </button>
          </div>

          <div style={{ opacity: 0.75, marginTop: 10 }}>
            Aktiv: {activeMachines.length} / Gesamt: {machines.length}
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {machines.map((m) => (
              <div
                key={m.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 200 }}>
                  <b>{m.name}</b> {!m.is_active && <span style={{ color: "crimson", marginLeft: 8 }}>(inaktiv)</span>}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => toggleActive("machines", m)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    {m.is_active ? "Deaktivieren" : "Aktivieren"}
                  </button>

                  <button
                    type="button"
                    onClick={() => rename("machines", m)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    Umbenennen
                  </button>

                  <button
                    type="button"
                    onClick={() => remove("machines", m)}
                    disabled={busy}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))}

            {machines.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine Maschinen angelegt.</div>}
          </div>
        </section>

        {msg && <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{msg}</pre>}
      </div>
    </main>
  );
}