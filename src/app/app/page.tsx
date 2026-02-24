"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type DriverRow = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  is_active: boolean | null;
};

type DayRow = {
  id: string;
  date: string; // YYYY-MM-DD
  user_id: string;
  is_urlaub?: boolean | null;
  is_wetter?: boolean | null;
};

type ItemRow = {
  workday_id: string;
  objekt: string | null;
};

type DayUI = {
  id: string;
  date: string;
  user_id: string;
  driver: string; // leer für Nicht-Admin
  objekte: string[];
  isUrlaub: boolean;
  isWetter: boolean;
};

function isoWeekKey(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map((x) => Number(x));
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const isoYear = date.getUTCFullYear();

  const yearStart = new Date(Date.UTC(isoYear, 0, 1, 12, 0, 0));
  const yearStartDay = yearStart.getUTCDay() || 7;
  const firstThursday = new Date(yearStart);
  firstThursday.setUTCDate(firstThursday.getUTCDate() + (4 - yearStartDay));

  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-KW${String(week).padStart(2, "0")}`;
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

  async function loadIsAdmin() {
    const { data, error } = await supabase.from("admin_users").select("user_id").limit(1);
    if (error) {
      setIsAdmin(false);
      return false;
    }
    const ok = ((data as any[]) ?? []).length > 0;
    setIsAdmin(ok);
    return ok;
  }

  async function load(adminFlag: boolean) {
    setMsg("Lade...");

    // 1) Workdays inkl. user_id
    const { data: dayData, error: dayErr } = await supabase
      .from("workdays")
      .select("id,date,user_id,is_urlaub,is_wetter")
      .order("date", { ascending: false })
      .limit(80);

    if (dayErr) {
      setMsg("Fehler: " + dayErr.message);
      setDays([]);
      return;
    }

    const rawDays = ((dayData as any[]) ?? []) as DayRow[];
    const ids = rawDays.map((d) => d.id);

    // 2) Fahrer-Namen NUR für Admin laden
    const driverMap = new Map<string, string>();
    if (adminFlag) {
      const { data: drvData, error: drvErr } = await supabase
        .from("driver_profiles")
        .select("user_id,username,full_name,is_active")
        .eq("is_active", true);

      if (!drvErr) {
        const drv = (((drvData as any[]) ?? []) as DriverRow[]).filter((x) => x.user_id);
        for (const r of drv) {
          const label = (r.full_name ?? "").trim() || (r.username ?? "").trim() || r.user_id;
          driverMap.set(r.user_id, label);
        }
      }
    }

    // 3) Items
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

      return {
        id: d.id,
        date: d.date,
        user_id: d.user_id,
        // ✅ nur Admin sieht Namen
        driver: adminFlag ? driverMap.get(d.user_id) ?? "" : "",
        objekte: uniq,
        isUrlaub: !!d.is_urlaub,
        isWetter: !!d.is_wetter,
      };
    });

    setDays(ui);
    setMsg("");
  }

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }
      setMeName(me.firstName);

      const adminFlag = await loadIsAdmin();
      await load(adminFlag);
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
    const keys = Array.from(g.keys()).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({ key: k, days: g.get(k)! }));
  }, [days]);

  function dayRowClass(d: DayUI) {
    if (d.isUrlaub) return "rowCard rowCardUrlaub";
    if (d.isWetter) return "rowCard rowCardWetter";
    return "rowCard";
  }

  async function deleteDay(dayId: string, dateISO: string) {
    const ok = confirm(`Diesen Tag wirklich löschen?\n${fmtDE(dateISO)}\n\nAchtung: Alle Einsätze werden mit gelöscht.`);
    if (!ok) return;

    setMsg("Lösche...");

    const { error: delItemsErr } = await supabase.from("work_items").delete().eq("workday_id", dayId);
    if (delItemsErr) {
      setMsg("Fehler beim Löschen der Einsätze: " + delItemsErr.message);
      return;
    }

    const { error: delDayErr } = await supabase.from("workdays").delete().eq("id", dayId);
    if (delDayErr) {
      setMsg("Fehler beim Löschen des Tages: " + delDayErr.message);
      return;
    }

    setMsg("✅ Gelöscht!");
    await load(isAdmin);
    setTimeout(() => setMsg(""), 600);
  }

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

        <button
          onClick={async () => {
            const adminFlag = await loadIsAdmin();
            await load(adminFlag);
          }}
          className="btn"
        >
          Aktualisieren
        </button>
      </div>

      {msg && <p className="msg">{msg}</p>}

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {grouped.map((w, idx) => (
          <details key={w.key} className="weekCard" open={idx === 0}>
            <summary className="weekSum">
              <span className="chev">▸</span>
              <span className="weekTitle">{w.key}</span>
              <span className="weekCount">{w.days.length} Tage</span>
            </summary>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {w.days.map((d) => (
                <div key={d.id} className="dayRowWrap">
                  <Link href={`/app/day/${d.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1 }}>
                    <div className={dayRowClass(d)}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <b>{fmtDE(d.date)}</b>
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.95 }}>
                        {/* ✅ Fahrer nur für Admin */}
                        {isAdmin && d.driver ? (
                          <>
                            <b>{d.driver}</b>
                            <span style={{ opacity: 0.55 }}> · </span>
                          </>
                        ) : null}

                        {d.isUrlaub ? (
                          <span style={{ fontWeight: 900 }}>🌴 Urlaub</span>
                        ) : d.isWetter ? (
                          <span style={{ fontWeight: 900 }}>🌧️ Wetter</span>
                        ) : d.objekte.length > 0 ? (
                          d.objekte.join(", ")
                        ) : (
                          <span style={{ opacity: 0.65 }}>(keine Einsätze)</span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="dayActions">
                    <Link href={`/app/day/${d.id}`} title="Bearbeiten" className="iconBtn">
                      ✏️
                    </Link>

                    <button
                      type="button"
                      title="Löschen"
                      className="iconBtn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteDay(d.id, d.date);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
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
.sub{opacity:.82;margin-top:6px}
.link{margin-left:10px;text-decoration:underline}

.btn{padding:10px 12px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:800}
.btnPrimary{padding:12px 14px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:900}
.msg{white-space:pre-wrap}

/* Woche */
.weekCard{border:1px solid #eee;border-radius:16px;padding:14px;background:#fff}
.weekSum{
  cursor:pointer;
  display:flex;
  align-items:center;
  gap:10px;
  font-weight:900;
  user-select:none;
  list-style:none;
}
.weekSum::-webkit-details-marker{display:none}
.chev{display:inline-block;transform:rotate(0deg);transition:transform .12s ease}
details[open] .chev{transform:rotate(90deg)}
.weekTitle{font-size:22px}
.weekCount{margin-left:auto;opacity:.65;font-weight:800}

/* Tag-Layout + Actions rechts */
.dayRowWrap{display:flex;gap:10px;align-items:stretch}
.dayActions{display:flex;gap:8px;align-items:stretch}
.iconBtn{
  width:44px;
  min-width:44px;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid #eee;
  border-radius:12px;
  background:#fff;
  font-weight:900;
  cursor:pointer;
  text-decoration:none;
  color:inherit;
}
.iconBtn:hover{border-color:#ddd}

/* Rows */
.rowCard{border:1px solid #eee;border-radius:14px;padding:12px;background:#fff}
.rowCardUrlaub{background:#ecfdf3;border-color:#c7f2d5}
.rowCardWetter{background:#eef6ff;border-color:#cfe4ff}

@media (max-width:700px){
  .h1{font-size:30px}
  .head{flex-direction:column;align-items:stretch}
  .weekTitle{font-size:18px}
  .dayRowWrap{flex-direction:column}
  .dayActions{justify-content:flex-end}
  .iconBtn{width:100%;min-width:unset;height:44px}
}
`;