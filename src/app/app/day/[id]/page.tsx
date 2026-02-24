"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

type Day = {
  id: string;
  date: string;
  arbeitsbeginn: string | null;
  arbeitsende: string | null;
  kommentar: string | null;
};

export default function Overview() {
  const [days, setDays] = useState<Day[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("Lade...");
    const { data, error } = await supabase
      .from("workdays")
      .select("id,date,arbeitsbeginn,arbeitsende,kommentar")
      .order("date", { ascending: false })
      .limit(60);

    if (error) {
      setMsg("Fehler: " + error.message);
      setDays([]);
    } else {
      setDays((data as any) ?? []);
      setMsg("");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/";
  }

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Übersicht (Tage)</h1>
        <button onClick={logout} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
          Abmelden
        </button>
      </header>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Link href="/new">
          <button style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 800 }}>
            + Neuer Tag
          </button>
        </Link>
        <button onClick={load} style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}>
          Aktualisieren
        </button>
      </div>

      {msg && <p>{msg}</p>}

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {days.map((d) => (
          <Link key={d.id} href={`/app/day/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <b>{d.date}</b>
                <span style={{ opacity: 0.8 }}>
                  {d.arbeitsbeginn ?? "--:--"} – {d.arbeitsende ?? "--:--"}
                </span>
              </div>
              {d.kommentar && <div style={{ marginTop: 6, opacity: 0.8 }}>{d.kommentar}</div>}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}