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

async function isAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

function normName(v: string) {
  // Trim + Mehrfachspaces entfernen
  return v.trim().replace(/\s+/g, " ");
}

export default function AdminPage() {
  const [meName, setMeName] = useState("");
  const [admin, setAdmin] = useState<boolean | null>(null);

  const [objects, setObjects] = useState<Row[]>([]);
  const [machines, setMachines] = useState<Row[]>([]);

  const [newObject, setNewObject] = useState("");
  const [newMachine, setNewMachine] = useState("");

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

    const [o, m] = await Promise.all([
      supabase.from("objects").select("*").order("is_active", { ascending: false }).order("name", { ascending: true }),
      supabase.from("machines").select("*").order("is_active", { ascending: false }).order("name", { ascending: true }),
    ]);

    setBusy(false);

    if (o.error) setMsg("Fehler Objekte laden: " + o.error.message);
    if (m.error) setMsg((prev) => (prev ? prev + "\n" : "") + "Fehler Maschinen laden: " + m.error.message);

    setObjects((o.data as any) ?? []);
    setMachines((m.data as any) ?? []);
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
      // unique constraint: einfach freundlich anzeigen
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

  const activeObjects = useMemo(() => objects.filter((x) => x.is_active), [objects]);
  const activeMachines = useMemo(() => machines.filter((x) => x.is_active), [machines]);

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

        <div style={{ display: "flex", gap: 10 }}>
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
                  <b>{o.name}</b>{" "}
                  {!o.is_active && <span style={{ color: "crimson", marginLeft: 8 }}>(inaktiv)</span>}
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
                  <b>{m.name}</b>{" "}
                  {!m.is_active && <span style={{ color: "crimson", marginLeft: 8 }}>(inaktiv)</span>}
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