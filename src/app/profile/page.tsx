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

  // Benutzer laden
  useEffect(() => {
    (async () => {
      const me = await getMe();

      if (!me) {
        location.href = "/";
        return;
      }

      setEmail(me.email || "");

      // aktuellen Vorname aus Metadata holen
      const { data } = await supabase.auth.getUser();
      const meta: any = data.user?.user_metadata || {};

      setFirstName(meta.first_name || meta.vorname || "");
      setLoading(false);
    })();
  }, []);

  // Vorname speichern
  async function save() {
    if (!firstName.trim()) {
      setMsg("Bitte einen Vornamen eingeben.");
      return;
    }

    setMsg("Speichern...");

    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: firstName.trim(),
      },
    });

    if (error) {
      setMsg("Fehler: " + error.message);
      return;
    }

    setMsg("✅ Vorname gespeichert!");
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
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Profil</h1>

        <Link href="/app">
          <button
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          >
            Zur Übersicht
          </button>
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

        <label style={{ display: "block" }}>
          Vorname
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

        {msg && (
          <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
            {msg}
          </p>
        )}
      </div>
    </main>
  );
}