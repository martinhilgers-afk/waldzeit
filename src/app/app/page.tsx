"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { getMe } from "@/lib/me";

type DayRow = {
  id: string;
  date: string; // YYYY-MM-DD
  work_items?: { objekt: string | null }[]; // joined
};

function parseISODate(dateStr: string) {
  // dateStr = YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDE(dateStr: string) {
  const d = parseISODate(dateStr);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function isoWeekInfo(dateStr: string) {
  // ISO week number + week start (Mon) / end (Sun)
  const d0 = parseISODate(dateStr);
  const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
  d.setHours(0, 0, 0, 0);

  // Thursday in current week decides the year
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - day + 3);

  const weekYear = thursday.getFullYear();

  // Week 1 = week with Jan 4
  const jan4 = new Date(weekYear, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setDate(jan4.getDate() - jan4Day);

  const diffDays = Math.round((thursday.getTime() - week1Mon.getTime()) / (1000 * 60 * 60 * 24));
  const weekNo = 1 + Math.floor(diffDays / 7);

  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - day); // Monday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // Sunday

  const range = `${weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}–${weekEnd.toLocaleDateString(
    "de-DE",
    { day: "2-digit", month: "2-digit" }
  )}`;

  return { weekYear, weekNo, weekStart, weekEnd, range };
}

function uniqObjects(items?: { objekt: string | null }[]) {
  const set = new Set<string>();
  (items ?? []).forEach((x) => {
    const o = (x.objekt ?? "").trim();
    if (o) set.add(o);
  });
  return Array.from(set);
}

export default function Overview() {
  const [days, setDays] = useState<DayRow[]>([]);
  const [msg, setMsg] = useState("");
  const [meName, setMeName] = useState<string>("");

  async function load() {
    setMsg("Lade...");
    const { data, error } = await supabase
      .from("workdays")
      .select("id,date,work_items(objekt)")
      .order("date", { ascending: false })
      .limit(200);

    if (error) {
      setMsg("Fehler: " + error.message);
      setDays([]);
    } else {
      setDays((data as any) ?? []);
      setMsg("");
    }
  }

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }
      setMeName(me.firstName);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/";
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; rows: DayRow[] }>();

    for (const d of days) {
      const wi = isoWeekInfo(d.date);
      const key = `${wi.weekYear}-W${String(wi.weekNo).padStart(2, "0")}`;
      const title = `KW ${wi.weekNo} / ${wi.weekYear} (${wi.range})`;

      if (!map.has(key)) map.set(key, { title, rows: [] });
      map.get(key)!.rows.push(d);
    }

    // map ist bereits in Reihenfolge der days (desc). Wir behalten die Insert-Reihenfolge.
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [days]);

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 12 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Übersicht</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Angemeldet als: <b>{meName || "…"}</b>{" "}
            <Link href="/profile" style={{ marginLeft: 10 }}>
              Profil
            </Link>
          </div>
        </div>

        <button onClick={logout} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
          Abmelden
        </button>
      </header>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Link href="/new">
          <button
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
            }}
          >
            + Neuer Tag
          </button>
        </Link>

        <button onClick={load} style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}>
          Aktualisieren
        </button>
      </div>

      {msg && <p style={{ whiteSpace: "pre-wrap" }}>{msg}</p>}

      {/* Wochen-Gruppierung */}
      <div style={{ display: "grid", gap: 18, marginTop: 16 }}>
        {grouped.map((g) => (
          <section key={g.key} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{g.title}</h2>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {g.rows.map((d) => {
                const objs = uniqObjects(d.work_items);
                const objText =
                  objs.length === 0 ? "—" : objs.length <= 3 ? objs.join(", ") : `${objs.slice(0, 3).join(", ")} (+${objs.length - 3})`;

                // ✅ Klick führt zum Bearbeiten dieses Datums
                return (
                  <Link
                    key={d.id}
                    href={`/new?date=${d.date}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                        <b>{formatDE(d.date)}</b>
                        <span style={{ opacity: 0.7 }}>Bearbeiten</span>
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.9 }}>
                        <span style={{ opacity: 0.75 }}>Objekte: </span>
                        {objText}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}