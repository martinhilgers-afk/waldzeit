"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type ExportMode =
  | "machine_range"
  | "driver_range"
  | "machine_object"
  | "driver_object"
  | "all_range"
  | "all_object";

type DriverRow = {
  user_id: string; // uuid
  username: string | null;
  full_name: string | null;
  default_machine: string | null;
  is_active: boolean | null;
};

type DayRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  arbeitsbeginn: string | null;
  arbeitsende: string | null;
  kommentar: string | null;
  is_urlaub: boolean | null;
  is_wetter: boolean | null;
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

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function firstOfMonthISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function sanitizeFilename(s: string) {
  return s.replace(/[^\w\-ÄÖÜäöüß]/g, "_").replace(/_+/g, "_");
}

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";

  const raw = String(v).trim();

  // erkennt Zahlen wie: 12 | -3 | 0.5 | 3.5 | 3,5
  const looksNumeric = /^-?\d+([.,]\d+)?$/.test(raw);

  // Excel (DE): Dezimalpunkt -> Dezimalkomma (ohne Quotes, damit es Zahl bleibt)
  const s = looksNumeric ? raw.replace(".", ",") : raw;

  if (/[;\n\r"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows: Array<Record<string, any>>) {
  const headerSet = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    for (const k of Object.keys(r)) headerSet.add(k);
  }

  const preferred = [
    "date",
    "objekt",
    "driver",
    "maschine",
    "is_urlaub",
    "is_wetter",
    "arbeitsbeginn",
    "arbeitsende",
    "tages_kommentar",
    "fahrtzeit_min",
    "mas_start",
    "mas_end",
    "maschinenstunden_h",
    "unterhalt_h",
    "reparatur_h",
    "motormanuel_h",
    "umsetzen_h",
    "sonstiges_h",
    "sonstiges_beschreibung",
    "diesel_l",
    "adblue_l",
    "einsatz_kommentar",
    "twinch_used",
    "twinch_h",
  ];

  const rest = Array.from(headerSet)
    .filter((h) => !preferred.includes(h))
    .sort((a, b) => a.localeCompare(b));
  const headers = [...preferred.filter((h) => headerSet.has(h)), ...rest];

  const lines: string[] = [];
  lines.push(headers.join(";"));
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r?.[h])).join(";"));
  }
  return lines.join("\n");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function isAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

export default function AdminExportPage() {
  const [meName, setMeName] = useState("");
  const [admin, setAdmin] = useState<boolean | null>(null);

  const [mode, setMode] = useState<ExportMode>("all_range");

  const [from, setFrom] = useState<string>(() => firstOfMonthISO());
  const [to, setTo] = useState<string>(() => todayISO());

  const [machines, setMachines] = useState<string[]>([]);
  const [objects, setObjects] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; label: string }>>([]);

  // ✅ NEU: Mapping für driver Feld (user_id -> Name)
  const [driverMap, setDriverMap] = useState<Map<string, string>>(new Map());

  const [selectedMachine, setSelectedMachine] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const needsRange = useMemo(
    () => mode === "machine_range" || mode === "driver_range" || mode === "all_range",
    [mode]
  );
  const needsMachine = useMemo(
    () => mode === "machine_range" || mode === "machine_object",
    [mode]
  );
  const needsDriver = useMemo(
    () => mode === "driver_range" || mode === "driver_object",
    [mode]
  );
  const needsObject = useMemo(
    () => mode === "machine_object" || mode === "driver_object" || mode === "all_object",
    [mode]
  );

  async function loadSelectors() {
    const [m, o, d] = await Promise.all([
      supabase.from("machines").select("name").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("objects").select("name").eq("is_active", true).order("name", { ascending: true }),
      supabase
        .from("driver_profiles")
        .select("user_id,username,full_name,is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
    ]);

    setMachines(((m.data as any[]) ?? []).map((x) => x.name));
    setObjects(((o.data as any[]) ?? []).map((x) => x.name));

    const drvRows = (((d.data as any[]) ?? []) as DriverRow[]).filter((x) => x.user_id);

    const drv = drvRows.map((x) => ({
      id: x.user_id, // value ist UUID
      label: x.full_name?.trim() || x.username?.trim() || x.user_id,
    }));

    setDrivers(drv);

    // ✅ Map bauen: user_id -> label
    const map = new Map<string, string>();
    for (const x of drvRows) {
      const label = x.full_name?.trim() || x.username?.trim() || x.user_id;
      map.set(x.user_id, label);
    }
    setDriverMap(map);
  }

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
        await loadSelectors();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runExport() {
    if (admin !== true) {
      setMsg("❌ Kein Admin-Zugriff.");
      return;
    }

    if (needsRange && (!from || !to)) return setMsg("Bitte Zeitraum (von/bis) setzen.");
    if (needsMachine && !selectedMachine) return setMsg("Bitte Maschine wählen.");
    if (needsDriver && !selectedDriver) return setMsg("Bitte Fahrer wählen.");
    if (needsObject && !selectedObject) return setMsg("Bitte Objekt wählen.");

    setLoading(true);
    setMsg("Export wird geladen...");

    // 1) Workdays (gefiltert)
    let q = supabase
      .from("workdays")
      .select("id,user_id,date,arbeitsbeginn,arbeitsende,kommentar,is_urlaub,is_wetter")
      .order("date", { ascending: true });

    if (needsRange) q = q.gte("date", from).lte("date", to);
    if (needsDriver) q = q.eq("user_id", selectedDriver);

    const { data: dayData, error: dayErr } = await q;
    if (dayErr) {
      setLoading(false);
      setMsg("Fehler Workdays: " + dayErr.message);
      return;
    }

    const days: DayRow[] = ((dayData as any[]) ?? []) as DayRow[];
    const dayIds = days.map((d) => d.id);

    if (dayIds.length === 0) {
      const filename = sanitizeFilename(`export_${mode}__leer.csv`);
      downloadText(filename, toCSV([]));
      setLoading(false);
      setMsg("✅ Keine Daten im Filter. Leere CSV exportiert.");
      return;
    }

    // 2) Items holen (für diese Workdays)
    const { data: itemData, error: itemErr } = await supabase
      .from("work_items")
      .select(
        "id,workday_id,objekt,maschine,fahrtzeit_min,mas_start,mas_end,maschinenstunden_h,unterhalt_h,reparatur_h,motormanuel_h,umsetzen_h,sonstiges_h,sonstiges_beschreibung,diesel_l,adblue_l,kommentar,twinch_used,twinch_h"
      )
      .in("workday_id", dayIds);

    if (itemErr) {
      setLoading(false);
      setMsg("Fehler Work Items: " + itemErr.message);
      return;
    }

    let items: ItemRow[] = ((itemData as any[]) ?? []) as ItemRow[];

    // 3) Filter auf Maschine/Objekt (wenn nötig)
    if (needsMachine) {
      const m = selectedMachine.trim();
      items = items.filter((it) => (it.maschine ?? "").trim() === m);
    }
    if (needsObject) {
      const o = selectedObject.trim();
      items = items.filter((it) => (it.objekt ?? "").trim() === o);
    }

    // 4) Join day + item
    const dayMap = new Map<string, DayRow>(days.map((d) => [d.id, d]));

    const itemRows: Array<Record<string, any>> = items.map((it) => {
      const d = dayMap.get(it.workday_id);
      const drvName = d?.user_id ? (driverMap.get(d.user_id) ?? "") : "";

      return {
        date: d?.date ?? "",
        objekt: it.objekt ?? "",
        driver: drvName,
        maschine: it.maschine ?? "",

        is_urlaub: d?.is_urlaub ?? false,
        is_wetter: d?.is_wetter ?? false,
        arbeitsbeginn: d?.arbeitsbeginn ?? "",
        arbeitsende: d?.arbeitsende ?? "",
        tages_kommentar: d?.kommentar ?? "",

        fahrtzeit_min: it.fahrtzeit_min ?? "",
        mas_start: it.mas_start ?? "",
        mas_end: it.mas_end ?? "",
        maschinenstunden_h: it.maschinenstunden_h ?? "",

        unterhalt_h: it.unterhalt_h ?? "",
        reparatur_h: it.reparatur_h ?? "",
        motormanuel_h: it.motormanuel_h ?? "",
        umsetzen_h: it.umsetzen_h ?? "",
        sonstiges_h: it.sonstiges_h ?? "",
        sonstiges_beschreibung: it.sonstiges_beschreibung ?? "",

        diesel_l: it.diesel_l ?? "",
        adblue_l: it.adblue_l ?? "",

        einsatz_kommentar: it.kommentar ?? "",
        twinch_used: it.twinch_used ?? false,
        twinch_h: it.twinch_h ?? "",
      };
    });

    // 5) Special-Days (Urlaub/Wetter) nur dann exportieren, wenn KEIN item-filter aktiv ist
    const hasItemFilter = needsMachine || needsObject;
    const specialDayRows: Array<Record<string, any>> = hasItemFilter
      ? []
      : days
          .filter((d) => (d.is_urlaub ?? false) || (d.is_wetter ?? false))
          .map((d) => ({
            date: d.date,
            objekt: "",
            driver: driverMap.get(d.user_id) ?? "",
            maschine: "",

            is_urlaub: d.is_urlaub ?? false,
            is_wetter: d.is_wetter ?? false,
            arbeitsbeginn: d.arbeitsbeginn ?? "",
            arbeitsende: d.arbeitsende ?? "",
            tages_kommentar: d.kommentar ?? "",

            fahrtzeit_min: "",
            mas_start: "",
            mas_end: "",
            maschinenstunden_h: "",
            unterhalt_h: "",
            reparatur_h: "",
            motormanuel_h: "",
            umsetzen_h: "",
            sonstiges_h: "",
            sonstiges_beschreibung: "",
            diesel_l: "",
            adblue_l: "",
            einsatz_kommentar: "",
            twinch_used: "",
            twinch_h: "",
          }));

    const finalRows =
      itemRows.length === 0 ? (hasItemFilter ? [] : specialDayRows) : [...itemRows, ...specialDayRows];

    const labelParts: string[] = [mode];
    if (needsRange) labelParts.push(`${from}_bis_${to}`);
    if (needsMachine) labelParts.push(`maschine_${selectedMachine}`);
    if (needsDriver) {
      const label = drivers.find((x) => x.id === selectedDriver)?.label || selectedDriver;
      labelParts.push(`fahrer_${label}`);
    }
    if (needsObject) labelParts.push(`objekt_${selectedObject}`);

    const filename = sanitizeFilename(`export_${labelParts.join("__")}.csv`);

    downloadText(filename, toCSV(finalRows));
    setLoading(false);
    setMsg(
      finalRows.length === 0
        ? "✅ Keine Daten im Filter. Leere CSV exportiert."
        : `✅ Export fertig: ${finalRows.length} Zeilen`
    );
  }

  if (admin === null) {
    return (
      <main style={{ maxWidth: 900, margin: "24px auto", padding: 12 }}>
        <h1 style={{ margin: 0 }}>Admin · Export</h1>
        <p style={{ marginTop: 10 }}>Lade…</p>
      </main>
    );
  }

  if (admin === false) {
    return (
      <main style={{ maxWidth: 900, margin: "24px auto", padding: 12 }}>
        <h1 style={{ margin: 0 }}>Admin · Export</h1>
        <p style={{ marginTop: 10, color: "crimson" }}>❌ Kein Admin-Zugriff.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/admin">
            <button style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", background: "#fff", fontWeight: 800 }}>
              Zurück
            </button>
          </Link>
          <Link href="/app">
            <button style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", background: "#fff", fontWeight: 800 }}>
              Zur Übersicht
            </button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1 className="h1">Admin · Export</h1>
          <div className="sub">
            Angemeldet als: <b>{meName || "…"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/admin">
            <button className="btn">Zurück</button>
          </Link>
          <Link href="/app">
            <button className="btn">Übersicht</button>
          </Link>
        </div>
      </header>

      <section className="card" style={{ marginTop: 14 }}>
        <h2 className="h2">Export-Option</h2>

        <label className="field">
          Modus
          <select value={mode} onChange={(e) => setMode(e.target.value as ExportMode)} className="control">
            <option value="machine_range">Pro Maschine · Zeitraum</option>
            <option value="driver_range">Pro Fahrer · Zeitraum</option>
            <option value="machine_object">Pro Maschine · Objekt</option>
            <option value="driver_object">Pro Fahrer · Objekt</option>
            <option value="all_range">Alles · Zeitraum</option>
            <option value="all_object">Alles · Objekt</option>
          </select>
        </label>

        {(needsRange || needsObject || needsMachine || needsDriver) && <div style={{ height: 8 }} />}

        {needsRange && (
          <div className="row2">
            <label className="field">
              Von
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="control" />
            </label>
            <label className="field">
              Bis
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="control" />
            </label>
          </div>
        )}

        {needsDriver && (
          <label className="field" style={{ marginTop: 10 }}>
            Fahrer
            <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} className="control">
              <option value="">Bitte wählen…</option>
              {drivers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {needsMachine && (
          <label className="field" style={{ marginTop: 10 }}>
            Maschine
            <select value={selectedMachine} onChange={(e) => setSelectedMachine(e.target.value)} className="control">
              <option value="">Bitte wählen…</option>
              {machines.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        )}

        {needsObject && (
          <label className="field" style={{ marginTop: 10 }}>
            Objekt
            <select value={selectedObject} onChange={(e) => setSelectedObject(e.target.value)} className="control">
              <option value="">Bitte wählen…</option>
              {objects.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        )}

        <button onClick={runExport} disabled={loading} className="btnPrimary" style={{ marginTop: 14 }}>
          {loading ? "Lade..." : "CSV exportieren"}
        </button>

        {msg && <p className="msg">{msg}</p>}

        <div className="hint" style={{ marginTop: 12 }}>
          Hinweis: Fahrer kommen aus <b>driver_profiles</b> (driver = full_name/username anhand workdays.user_id).
        </div>
      </section>

      <style jsx>{baseStyles}</style>
    </main>
  );
}

const baseStyles = `
.wrap{max-width:900px;margin:24px auto;padding:12px}
.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.h1{margin:0;font-size:32px;line-height:1.1}
.h2{margin:0 0 10px 0;font-size:22px}
.sub{opacity:.82;margin-top:6px}
.card{border:1px solid #eee;border-radius:16px;padding:14px;background:#fff}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{display:block}
.control{
  width:100%;
  padding:12px;
  font-size:16px;
  margin-top:6px;
  border-radius:12px;
  border:1px solid #d9d9d9;
  background:#fff;
  box-sizing:border-box;
}
.btn{padding:10px 12px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:800}
.btnPrimary{padding:12px 14px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:900}
.msg{margin-top:10px;white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:10px}
.hint{padding:10px 12px;border:1px dashed #ddd;border-radius:12px;background:#fafafa;font-weight:700}
@media(max-width:700px){
  .row2{grid-template-columns:1fr}
  .head{flex-direction:column;align-items:stretch}
}
`;