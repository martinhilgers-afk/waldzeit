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
  user_id: string;
  date: string;
  arbeitsbeginn: string | null;
  arbeitsende: string | null;
  kommentar: string | null;
  is_urlaub: boolean | null;
  is_wetter: boolean | null;
  is_controlled: boolean | null;
  controlled_at: string | null;
};

type ItemRow = {
  id: string;
  workday_id: string;
  objekt: string | null;
  maschine: string | null;
  fahrtzeit_min: number | null;
  mas_start: number | null;
  mas_end: number | null;
  maschinenstunden_h: number | null;
  unterhalt_h: number | null;
  reparatur_h: number | null;
  motormanuel_h: number | null;
  umsetzen_h: number | null;
  sonstiges_h: number | null;
  sonstiges_beschreibung: string | null;
  diesel_l: number | null;
  adblue_l: number | null;
  kommentar: string | null;
  twinch_used: boolean | null;
  twinch_h: number | null;
};

type ControlDay = DayRow & {
  driverName: string;
  items: ItemRow[];
};

type NumField =
  | "fahrtzeit_min"
  | "mas_start"
  | "mas_end"
  | "maschinenstunden_h"
  | "unterhalt_h"
  | "reparatur_h"
  | "motormanuel_h"
  | "umsetzen_h"
  | "sonstiges_h"
  | "diesel_l"
  | "adblue_l"
  | "twinch_h";

const NUM_FIELDS: NumField[] = [
  "fahrtzeit_min",
  "mas_start",
  "mas_end",
  "maschinenstunden_h",
  "unterhalt_h",
  "reparatur_h",
  "motormanuel_h",
  "umsetzen_h",
  "sonstiges_h",
  "diesel_l",
  "adblue_l",
  "twinch_h",
];

async function isAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtDE(dateISO: string) {
  const [y, m, d] = dateISO.split("-");
  return `${d}.${m}.${y}`;
}

function isoWeekKey(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
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

function toEditValue(v: number | null | undefined) {
  if (v === null || v === undefined) return "";
  return String(v).replace(".", ",");
}

function toNumOrNull(v: string) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function sortByLastname(a: DriverRow, b: DriverRow) {
  const getLast = (name: string | null) => {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase() : "";
  };

  const cmp = getLast(a.full_name).localeCompare(getLast(b.full_name), "de", { sensitivity: "base" });
  if (cmp !== 0) return cmp;

  return String(a.full_name || "").localeCompare(String(b.full_name || ""), "de", { sensitivity: "base" });
}

export default function AdminControlPage() {
  const [meName, setMeName] = useState("");
  const [admin, setAdmin] = useState<boolean | null>(null);

  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [selectedDriver, setSelectedDriver] = useState("");
  const [onlyUnchecked, setOnlyUnchecked] = useState(true);

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [days, setDays] = useState<ControlDay[]>([]);

  const [edits, setEdits] = useState<Record<string, Partial<Record<NumField, string>>>>({});
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

      if (ok) await loadData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setBusy(true);
    setMsg("Lade...");

    const dRes = await supabase
      .from("driver_profiles")
      .select("user_id,username,full_name,is_active")
      .order("full_name", { ascending: true });

    if (dRes.error) {
      setBusy(false);
      setMsg("Fehler Fahrer laden: " + dRes.error.message);
      return;
    }

    const driverRows = (((dRes.data as any[]) ?? []) as DriverRow[]).sort(sortByLastname);
    setDrivers(driverRows);

    const driverMap = new Map<string, string>();
    for (const d of driverRows) {
      driverMap.set(d.user_id, d.full_name?.trim() || d.username?.trim() || d.user_id);
    }

    let q = supabase
      .from("workdays")
      .select("id,user_id,date,arbeitsbeginn,arbeitsende,kommentar,is_urlaub,is_wetter,is_controlled,controlled_at")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });

    if (selectedDriver) q = q.eq("user_id", selectedDriver);
    if (onlyUnchecked) q = q.or("is_controlled.is.null,is_controlled.eq.false");

    const dayRes = await q;

    if (dayRes.error) {
      setBusy(false);
      setMsg("Fehler Tage laden: " + dayRes.error.message);
      return;
    }

    const dayRows = ((dayRes.data as any[]) ?? []) as DayRow[];
    const dayIds = dayRows.map((d) => d.id);

    let itemRows: ItemRow[] = [];

    if (dayIds.length > 0) {
      const itemRes = await supabase
        .from("work_items")
        .select(
          "id,workday_id,objekt,maschine,fahrtzeit_min,mas_start,mas_end,maschinenstunden_h,unterhalt_h,reparatur_h,motormanuel_h,umsetzen_h,sonstiges_h,sonstiges_beschreibung,diesel_l,adblue_l,kommentar,twinch_used,twinch_h"
        )
        .in("workday_id", dayIds);

      if (itemRes.error) {
        setBusy(false);
        setMsg("Fehler Einsätze laden: " + itemRes.error.message);
        return;
      }

      itemRows = ((itemRes.data as any[]) ?? []) as ItemRow[];
    }

    const itemMap = new Map<string, ItemRow[]>();
    for (const item of itemRows) {
      const arr = itemMap.get(item.workday_id) ?? [];
      arr.push(item);
      itemMap.set(item.workday_id, arr);
    }

    const finalDays: ControlDay[] = dayRows.map((d) => ({
      ...d,
      driverName: driverMap.get(d.user_id) || d.user_id,
      items: itemMap.get(d.id) ?? [],
    }));

    const nextEdits: Record<string, Partial<Record<NumField, string>>> = {};
    for (const item of itemRows) {
      nextEdits[item.id] = {};
      for (const f of NUM_FIELDS) {
        nextEdits[item.id]![f] = toEditValue(item[f]);
      }
    }

    setDays(finalDays);
    setEdits(nextEdits);
    setMsg("");
    setBusy(false);
  }

  function updateEdit(itemId: string, field: NumField, value: string) {
    setEdits((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {}),
        [field]: value,
      },
    }));
  }

  function getEdit(item: ItemRow, field: NumField) {
    return edits[item.id]?.[field] ?? toEditValue(item[field]);
  }

  async function saveItem(item: ItemRow) {
    const e = edits[item.id] ?? {};

    const payload: Record<string, number | null> = {};
    for (const f of NUM_FIELDS) {
      payload[f] = toNumOrNull(e[f] ?? "");
    }

    const { error } = await supabase.from("work_items").update(payload).eq("id", item.id);

    if (error) throw new Error(error.message);
  }

  async function saveDayAndMarkControlled(day: ControlDay) {
    if (!confirm(`${fmtDE(day.date)} von ${day.driverName} speichern und als kontrolliert markieren?`)) return;

    setBusy(true);
    setMsg("Speichere Kontrolle...");

    try {
      for (const item of day.items) {
        await saveItem(item);
      }

      const { error } = await supabase
        .from("workdays")
        .update({
          is_controlled: true,
          controlled_at: new Date().toISOString(),
        })
        .eq("id", day.id);

      if (error) throw new Error(error.message);

      setMsg("✅ Gespeichert und als kontrolliert markiert.");
      await loadData();
    } catch (e: any) {
      setMsg("Fehler: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function markUnchecked(day: ControlDay) {
    if (!confirm(`${fmtDE(day.date)} wieder auf NICHT kontrolliert setzen?`)) return;

    setBusy(true);
    setMsg("Speichere...");

    const { error } = await supabase
      .from("workdays")
      .update({
        is_controlled: false,
        controlled_at: null,
      })
      .eq("id", day.id);

    if (error) {
      setMsg("Fehler: " + error.message);
      setBusy(false);
      return;
    }

    setMsg("✅ Zurückgesetzt.");
    await loadData();
    setBusy(false);
  }

  const grouped = useMemo(() => {
    const g = new Map<string, ControlDay[]>();

    for (const d of days) {
      const key = isoWeekKey(d.date);
      const arr = g.get(key) ?? [];
      arr.push(d);
      g.set(key, arr);
    }

    const keys = Array.from(g.keys()).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((key) => ({ key, days: g.get(key)! }));
  }, [days]);

  if (admin === null) {
    return (
      <main className="wrap">
        <h1 className="h1">Kontrolle</h1>
        <p>Lade…</p>
        <style jsx>{baseStyles}</style>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="wrap">
        <h1 className="h1">Kontrolle</h1>
        <p className="bad">❌ Du bist kein Admin.</p>
        <Link href="/app">
          <button className="btn">Zur Übersicht</button>
        </Link>
        <style jsx>{baseStyles}</style>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1 className="h1">Kontrolle</h1>
          <div className="sub">
            Angemeldet als: <b>{meName || "…"}</b>
          </div>
        </div>

        <div className="topActions">
          <Link href="/admin">
            <button className="btn">Admin</button>
          </Link>
          <Link href="/admin/export">
            <button className="btn">Export</button>
          </Link>
          <Link href="/app">
            <button className="btn">Übersicht</button>
          </Link>
        </div>
      </header>

      <section className="card">
        <h2 className="h2">Filter</h2>

        <div className="filterGrid">
          <label className="field">
            Von
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="control" />
          </label>

          <label className="field">
            Bis
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="control" />
          </label>

          <label className="field">
            Fahrer
            <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} className="control">
              <option value="">Alle Fahrer</option>
              {drivers.map((d) => (
                <option key={d.user_id} value={d.user_id}>
                  {d.full_name || d.username || d.user_id}
                </option>
              ))}
            </select>
          </label>

          <label className="checkBox">
            <input type="checkbox" checked={onlyUnchecked} onChange={(e) => setOnlyUnchecked(e.target.checked)} />
            Nur nicht kontrollierte Tage
          </label>

          <button onClick={loadData} disabled={busy} className="btnPrimary">
            {busy ? "Lade..." : "Aktualisieren"}
          </button>
        </div>

        {msg && <pre className="msg">{msg}</pre>}
      </section>

      <div className="weeks">
        {grouped.map((w, idx) => (
          <details key={w.key} className="weekCard" open={idx === 0}>
            <summary className="weekSummary">
              <span className="plus">＋</span>
              <span>{w.key}</span>
              <span className="count">{w.days.length} Tage</span>
            </summary>

            <div className="days">
              {w.days.map((d) => (
                <details key={d.id} className={d.is_controlled ? "dayCard controlled" : "dayCard"}>
                  <summary className="daySummary">
                    <div>
                      <b>{fmtDE(d.date)}</b> · {d.driverName}
                      {d.is_urlaub && <span className="badge green">Urlaub</span>}
                      {d.is_wetter && <span className="badge blue">Wetter</span>}
                      {d.is_controlled && <span className="badge done">Kontrolliert</span>}
                    </div>
                    <span className="count">{d.items.length} Einsätze</span>
                  </summary>

                  {d.kommentar && <div className="comment">Tageskommentar: {d.kommentar}</div>}

                  {d.items.length === 0 ? (
                    <div className="empty">Keine Einsätze</div>
                  ) : (
                    <div className="items">
                      {d.items.map((it, idx) => (
                        <div key={it.id} className="itemRow">
                          <div className="itemHead">
                            <div>
                              <b>Einsatz {idx + 1}</b> · {it.objekt || "Ohne Objekt"} · {it.maschine || "Ohne Maschine"}
                            </div>
                          </div>

                          <div className="editGrid">
                            <NumberInput label="Fahrtzeit min" value={getEdit(it, "fahrtzeit_min")} onChange={(v) => updateEdit(it.id, "fahrtzeit_min", v)} />
                            <NumberInput label="MAS Start" value={getEdit(it, "mas_start")} onChange={(v) => updateEdit(it.id, "mas_start", v)} />
                            <NumberInput label="MAS Ende" value={getEdit(it, "mas_end")} onChange={(v) => updateEdit(it.id, "mas_end", v)} />
                            <NumberInput label="MAS h" value={getEdit(it, "maschinenstunden_h")} onChange={(v) => updateEdit(it.id, "maschinenstunden_h", v)} />
                            <NumberInput label="Unterhalt" value={getEdit(it, "unterhalt_h")} onChange={(v) => updateEdit(it.id, "unterhalt_h", v)} />
                            <NumberInput label="Reparatur" value={getEdit(it, "reparatur_h")} onChange={(v) => updateEdit(it.id, "reparatur_h", v)} />
                            <NumberInput label="Motormanuel" value={getEdit(it, "motormanuel_h")} onChange={(v) => updateEdit(it.id, "motormanuel_h", v)} />
                            <NumberInput label="Umsetzen" value={getEdit(it, "umsetzen_h")} onChange={(v) => updateEdit(it.id, "umsetzen_h", v)} />
                            <NumberInput label="Sonstiges" value={getEdit(it, "sonstiges_h")} onChange={(v) => updateEdit(it.id, "sonstiges_h", v)} />
                            <NumberInput label="Diesel" value={getEdit(it, "diesel_l")} onChange={(v) => updateEdit(it.id, "diesel_l", v)} />
                            <NumberInput label="AdBlue" value={getEdit(it, "adblue_l")} onChange={(v) => updateEdit(it.id, "adblue_l", v)} />
                            <NumberInput label="Twinch" value={getEdit(it, "twinch_h")} onChange={(v) => updateEdit(it.id, "twinch_h", v)} />
                          </div>

                          {(it.sonstiges_beschreibung || it.kommentar) && (
                            <div className="comment">
                              {it.sonstiges_beschreibung && <>Beschreibung: {it.sonstiges_beschreibung}</>}
                              {it.kommentar && <> · Kommentar: {it.kommentar}</>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="dayActions">
                    <button type="button" onClick={() => saveDayAndMarkControlled(d)} disabled={busy} className="btnPrimary">
                      Speichern + kontrolliert
                    </button>

                    {d.is_controlled && (
                      <button type="button" onClick={() => markUnchecked(d)} disabled={busy} className="btn">
                        Wieder öffnen
                      </button>
                    )}

                    <Link href={`/app/day/${d.id}`}>
                      <button className="btn">Tag öffnen</button>
                    </Link>
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}

        {grouped.length === 0 && <div className="card">Keine Daten im gewählten Zeitraum.</div>}
      </div>

      <style jsx>{baseStyles}</style>
    </main>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="numField">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
    </label>
  );
}

const baseStyles = `
.wrap{max-width:980px;margin:24px auto;padding:12px}
.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.h1{margin:0;font-size:36px;line-height:1.1}
.h2{margin:0 0 10px 0;font-size:22px}
.sub{opacity:.82;margin-top:6px}
.topActions{display:flex;gap:10px;flex-wrap:wrap}
.btn,.btnPrimary{border:1px solid #ddd;background:#fff;font-weight:800;cursor:pointer}
.btn{padding:10px 12px;border-radius:12px}
.btnPrimary{padding:12px 14px;border-radius:12px;font-weight:900}
.card,.weekCard,.dayCard{border:1px solid #eee;border-radius:16px;padding:14px;background:#fff}
.card{margin-top:14px}
.filterGrid{display:grid;grid-template-columns:1fr 1fr 1.4fr 1.4fr auto;gap:10px;align-items:end}
.field{display:block}
.control{width:100%;padding:12px;font-size:16px;margin-top:6px;border-radius:12px;border:1px solid #d9d9d9;background:#fff;box-sizing:border-box}
.checkBox{display:flex;gap:10px;align-items:center;border:1px solid #eee;border-radius:12px;padding:12px;font-weight:800;background:#fff}
.msg{margin-top:10px;white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:10px}
.bad{color:crimson;font-weight:800}
.weeks{display:grid;gap:12px;margin-top:14px}
.weekSummary,.daySummary{cursor:pointer;display:flex;align-items:center;gap:10px;font-weight:900;list-style:none;user-select:none}
.weekSummary::-webkit-details-marker,.daySummary::-webkit-details-marker{display:none}
.plus{display:inline-block;transition:transform .12s ease;font-size:22px}
details[open]>.weekSummary .plus,details[open]>.daySummary .plus{transform:rotate(45deg)}
.count{margin-left:auto;opacity:.65;font-weight:800}
.days{display:grid;gap:10px;margin-top:12px}
.dayCard{padding:12px}
.dayCard.controlled{background:#fbfffb;border-color:#c7f2d5}
.badge{display:inline-block;margin-left:8px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:900}
.badge.green{background:#ecfdf3;border:1px solid #c7f2d5}
.badge.blue{background:#eef6ff;border:1px solid #cfe4ff}
.badge.done{background:#e2f0d9;border:1px solid #b6d7a8}
.items{display:grid;gap:8px;margin-top:10px}
.itemRow{border:1px solid #eee;border-radius:12px;padding:10px;background:#fafafa}
.itemHead{display:flex;justify-content:space-between;gap:10px;align-items:center}
.editGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.numField{font-size:12px;font-weight:800;opacity:.95}
.numField input{width:100%;margin-top:4px;padding:9px;border:1px solid #ddd;border-radius:10px;font-size:15px;box-sizing:border-box;background:#fff}
.comment{font-size:13px;margin-top:8px;opacity:.82}
.empty{margin-top:10px;opacity:.65}
.dayActions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
@media(max-width:700px){
  .h1{font-size:30px}
  .head{flex-direction:column;align-items:stretch}
  .filterGrid{grid-template-columns:1fr}
  .daySummary{align-items:flex-start;flex-direction:column}
  .count{margin-left:0}
  .editGrid{grid-template-columns:1fr 1fr}
  .dayActions .btn,.dayActions .btnPrimary{width:100%}
}
`;