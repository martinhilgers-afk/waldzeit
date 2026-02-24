"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

export default function ProfilePage() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ NEW
  const [machineOptions, setMachineOptions] = useState<string[]>([]);
  const [defaultMachine, setDefaultMachine] = useState<string>("");

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }

      setEmail(me.email || "");

      // Vorname aus Metadata holen (wie bisher)
      const { data } = await supabase.auth.getUser();
      const meta: any = data.user?.user_metadata || {};
      setFirstName(meta.first_name || meta.vorname || "");

      // ✅ Maschinen laden
      const m = await supabase.from("machines").select("name").eq("is_active", true).order("name", { ascending: true });
      setMachineOptions(((m.data as any[]) ?? []).map((x) => x.name));

      // ✅ Standard-Maschine aus user_settings laden
      const { data: settings } = await supabase
        .from("user_settings")
        .select("default_machine")
        .eq("user_id", me.id)
        .maybeSingle();

      setDefaultMachine(settings?.default_machine ?? "");

      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!firstName.trim()) {
      setMsg("Bitte einen Namen eingeben.");
      return;
    }

    setMsg("Speichern...");

    // 1) Name speichern (wie bisher)
    const { error: nameErr } = await supabase.auth.updateUser({
      data: { first_name: firstName.trim() },
    });

    if (nameErr) {
      setMsg("Fehler Name: " + nameErr.message);
      return;
    }

    // 2) Standard-Maschine speichern (NEW)
    const me = await getMe();
    if (!me) {
      setMsg("Fehler: nicht eingeloggt.");
      return;
    }

    const { error: setErr } = await supabase
      .from("user_settings")
      .upsert(
        {
          user_id: me.id,
          default_machine: defaultMachine.trim() ? defaultMachine.trim() : null,
        },
        { onConflict: "user_id" }
      );

    if (setErr) {
      setMsg("Fehler Standard-Maschine: " + setErr.message);
      return;
    }

    setMsg("✅ Profil gespeichert!");
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 520, margin: "24px auto", padding: 12 }}>
        <p>Lade Profil...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 520, margin: "24px auto", padding: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Profil</h1>

        <Link href="/app">
          <button style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>Zur Übersicht</button>
        </Link>
      </header>

      <div style={{ marginTop: 20 }}>
        <label style={{ display: "block", marginBottom: 12 }}>
          E-Mail
          <input
            value={email}
            disabled
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              marginTop: 6,
              background: "#f5f5f5",
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Name
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="z.B. Martin"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              marginTop: 6,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          />
        </label>

        {/* ✅ NEW: Standard-Maschine */}
        <label style={{ display: "block" }}>
          Standard-Maschine
          <select
            value={defaultMachine}
            onChange={(e) => setDefaultMachine(e.target.value)}
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              marginTop: 6,
              border: "1px solid #ddd",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            <option value="">(keine)</option>
            {machineOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={save}
          style={{
            marginTop: 16,
            padding: 14,
            fontSize: 16,
            fontWeight: 800,
            borderRadius: 12,
            border: "1px solid #ddd",
            width: "100%",
          }}
        >
          Speichern
        </button>

        {msg && <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{msg}</p>}
      </div>
    </main>
  );
}