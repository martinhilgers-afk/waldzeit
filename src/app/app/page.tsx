"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type DayRow = {
  id: string;
  date: string; // YYYY-MM-DD
};

type ItemRow = {
  workday_id: string;
  objekt: string | null;
};

type DayUI = {
  id: string;
  date: string;
  objekte: string[]; // unique
};

function isoWeekKey(dateISO: string) {
  // ISO week: returns "2026-KW09"
  const d = new Date(dateISO + "T12:00:00");
  const dayNum = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - dayNum + 3); // Thursday
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getFullYear()}-KW${String(week).padStart(2, "0")}`;
}

function fmtDE(dateISO: string) {
  const [y, m, d] = dateISO.split("-");
  return `${d}.${m}.${y}`;
}

export default function Overview() {
  const [days, setDays] = useState<DayUI[]>([]);
  const [msg, setMsg] = useState("");
  const [meName, setMeName] = useState<string>("");

  const [isAdmin, setIsAdmin] = useState(false);

  async function load() {
    setMsg("Lade...");

    // 1) Workdays
    const { data: dayData, error: dayErr } = await supabase
      .from("workdays")
      .select("id,date")
      .order("date", { ascending: false })
      .limit(80);

    if (dayErr) {
      setMsg("Fehler: " + dayErr.message);
      setDays([]);
      return;
    }

    const rawDays = ((dayData as any[]) ?? []) as DayRow[];
    const ids = rawDays.map((d) => d.id);

    // 2) Objekte der Einsätze für diese Tage
    let itemData: ItemRow[] = [];
    if (ids.length > 0) {
      const { data: items, error: itemErr } = await supabase
        .from("work_items")
        .select("workday_id,objekt")
        .in("workday_id", ids);

      if (itemErr) {
        setMsg("Fehler: " + itemErr.message);
        setDays([]);
        return;
      }

      itemData = ((items as any[]) ?? []) as ItemRow[];
    }

    const map = new Map<string, string[]>();
    for (const it of itemData) {
      if (!it.workday_id) continue;
      const v = (it.objekt ?? "").trim();
      if (!v) continue;
      const arr = map.get(it.workday_id) ?? [];
      arr.push(v);
      map.set(it.workday_id, arr);
    }

    const ui: DayUI[] = rawDays.map((d) => {
      const objs = map.get(d.id) ?? [];
      const uniq = Array.from(new Set(objs)).sort((a, b) => a.localeCompare(b));
      return { id: d.id, date: d.date, objekte: uniq };
    });

    setDays(ui);
    setMsg("");
  }

  async function loadIsAdmin() {
    // wichtig: das muss mit eingeloggtem User laufen
    const { data, error } = await supabase.from("admin_users").select("user_id").limit(1);
    if (error) {
      // wenn RLS blockiert -> dann bist du nicht admin (oder policy falsch)
      setIsAdmin(false);
      return;
    }
    setIsAdmin((data as any[])?.length > 0);
  }

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }
      setMeName(me.firstName);

      await Promise.all([loadIsAdmin(), load()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/";
  }

  const grouped = useMemo(() => {
    const g = new Map<string, DayUI[]>();
    for (const d of days) {
      const key = isoWeekKey(d.date);
      const arr = g.get(key) ?? [];
      arr.push(d);
      g.set(key, arr);
    }
    // sort keys desc
    const keys = Array.from(g.keys()).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({ key: k, days: g.get(k)! }));
  }, [days]);

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1 className="h1">Übersicht</h1>
          <div className="sub">
            Angemeldet als: <b>{meName || "…"}</b>{" "}
            <Link href="/profile" className="link">
              Profil
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isAdmin && (
            <Link href="/admin">
              <button className="btn">Admin</button>
            </Link>
          )}
          <button onClick={logout} className="btn">
            Abmelden
          </button>
        </div>
      </header>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Link href="/new">
          <button className="btnPrimary">+ Neuer Tag</button>
        </Link>

        <button onClick={load} className="btn">
          Aktualisieren
        </button>
      </div>

      {msg && <p className="msg">{msg}</p>}

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {grouped.map((w) => (
          <section key={w.key} className="card">
            <h2 className="h2">{w.key}</h2>

            <div style={{ display: "grid", gap: 10 }}>
              {w.days.map((d) => (
                <Link key={d.id} href={`/app/day/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="rowCard">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <b>{fmtDE(d.date)}</b>
                      {/* Uhrzeiten absichtlich weg */}
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.85 }}>
                      {d.objekte.length > 0 ? d.objekte.join(", ") : <span style={{ opacity: 0.6 }}>(keine Einsätze)</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <style jsx>{baseStyles}</style>
    </main>
  );
}

const baseStyles = `
.wrap{max-width:900px;margin:24px auto;padding:12px}
.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.h1{margin:0;font-size:36px;line-height:1.1}
.h2{margin:0 0 10px 0;font-size:22px}
.sub{opacity:.82;margin-top:6px}
.link{margin-left:10px;text-decoration:underline}
.card{border:1px solid #eee;border-radius:16px;padding:14px;background:#fff}
.rowCard{border:1px solid #eee;border-radius:14px;padding:12px}
.btn{padding:10px 12px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:800}
.btnPrimary{padding:12px 14px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:900}
.msg{white-space:pre-wrap}
@media (max-width:700px){
  .h1{font-size:30px}
  .head{flex-direction:column;align-items:stretch}
}
`;