"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type Driver = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  is_active: boolean | null;
};

type Option = {
  id: string;
  name: string;
  serial_number?: string | null;
  is_active?: boolean | null;
};

type KomatsuRow = {
  id: string;
  import_name: string | null;
  serial_number: string | null;
  machine_name: string | null;
  corrected_machine_name: string | null;
  driver_name: string | null;
  corrected_driver_id: string | null;
  date: string;
  object_name: string | null;
  corrected_object_name: string | null;
  motor_runtime_h: number | null;
  effective_work_h: number | null;
  motorstunden: number | null;
  is_checked: boolean;
  note?: string | null;
};

type WorkItemRef = {
  id: string;
  workday_id: string;
  date: string;
  user_id: string;
  objekt: string | null;
  maschine: string | null;
  maschinenstunden_h: number | null;
  motormanuel_h: number | null;
};

type WaldzeitMatch = {
  hours: number;
  items: WorkItemRef[];
  matchType: "exact" | "machine" | "none";
};

type EnrichedRow = {
  r: KomatsuRow;
  komatsu: number | null;
  wald: number | null;
  diff: number | null;
  statusText: string;
  statusClass: "ok" | "warn" | "bad";
  match: WaldzeitMatch;
};

type DriverGroup = {
  driverId: string;
  driverName: string;
  rows: EnrichedRow[];
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtDE(dateISO: string) {
  const [y, m, d] = String(dateISO).split("-");
  return `${d}.${m}.${y}`;
}

function round1(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function format1(v: number | null | undefined) {
  const r = round1(v);
  if (r === null) return "-";
  return r.toFixed(1);
}

function toNum(v: any) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return round1(v);
  const s = String(v).replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? round1(n) : null;
}

function toEditValue(v: number | null | undefined) {
  const r = round1(v);
  if (r === null) return "";
  return String(r).replace(".", ",");
}

function excelDateToISO(v: any) {
  if (!v) return "";

  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }

  const s = String(v).trim();

  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  return "";
}

function labelDriver(d: Driver) {
  return d.full_name?.trim() || d.username?.trim() || d.user_id;
}

function norm(s: any) {
  return String(s ?? "").trim();
}

function keyPart(s: any) {
  return norm(s).toLowerCase();
}

function makeExactKey(date: string, driverId: string, machine: string, objectName: string) {
  return [date, driverId, keyPart(machine), keyPart(objectName)].join("__");
}

function makeMachineKey(date: string, driverId: string, machine: string) {
  return [date, driverId, keyPart(machine)].join("__");
}

function getStatus(diff: number | null, hasMapping: boolean, matchType: WaldzeitMatch["matchType"]) {
  if (!hasMapping) return { text: "❓ Zuordnung fehlt", cls: "warn" as const };
  if (matchType === "none") return { text: "❓ Keine Waldzeit", cls: "warn" as const };
  if (diff === null) return { text: "❓ Keine Waldzeit", cls: "warn" as const };

  const a = Math.abs(diff);
  if (a <= 0.2) return { text: "✅ OK", cls: "ok" as const };
  if (a <= 0.5) return { text: "⚠️ Prüfen", cls: "warn" as const };
  return { text: "🔴 Fehler", cls: "bad" as const };
}

async function isAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

export default function KomatsuPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [meName, setMeName] = useState("");

  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [onlyOpen, setOnlyOpen] = useState(true);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [objects, setObjects] = useState<Option[]>([]);
  const [machines, setMachines] = useState<Option[]>([]);
  const [rows, setRows] = useState<KomatsuRow[]>([]);

  const [exactWaldzeitMap, setExactWaldzeitMap] = useState<Map<string, WaldzeitMatch>>(new Map());
  const [machineWaldzeitMap, setMachineWaldzeitMap] = useState<Map<string, WaldzeitMatch>>(new Map());

  const [waldzeitEdits, setWaldzeitEdits] = useState<Record<string, string>>({});
  const [openDrivers, setOpenDrivers] = useState<Record<string, boolean>>({});

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

      if (ok) await loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setBusy(true);
    setMsg("Lade...");

    const [d, o, m] = await Promise.all([
      supabase.from("driver_profiles").select("user_id,full_name,username,is_active").eq("is_active", true).order("full_name"),
      supabase.from("objects").select("id,name,is_active").eq("is_active", true).order("name"),
      supabase.from("machines").select("id,name,serial_number,is_active").eq("is_active", true).order("name"),
    ]);

    if (d.error || o.error || m.error) {
      setMsg("Fehler Stammdaten laden.");
      setBusy(false);
      return;
    }

    setDrivers((d.data as any[]) ?? []);
    setObjects((o.data as any[]) ?? []);
    setMachines((m.data as any[]) ?? []);

    await loadRows();
    setBusy(false);
  }

  async function loadRows() {
    setBusy(true);

    let q = supabase
      .from("komatsu_hours")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });

    if (onlyOpen) q = q.eq("is_checked", false);

    const { data, error } = await q;

    if (error) {
      setMsg("Fehler Komatsu laden: " + error.message);
      setBusy(false);
      return;
    }

    const r = ((data as any[]) ?? []) as KomatsuRow[];
    setRows(r);

    await buildWaldzeitMaps();

    setMsg("");
    setBusy(false);
  }

  async function buildWaldzeitMaps() {
    const { data: days, error: dayErr } = await supabase
      .from("workdays")
      .select("id,user_id,date")
      .gte("date", from)
      .lte("date", to);

    if (dayErr) return;

    const dayRows = ((days as any[]) ?? []) as { id: string; user_id: string; date: string }[];
    const dayIds = dayRows.map((d) => d.id);

    if (dayIds.length === 0) {
      setExactWaldzeitMap(new Map());
      setMachineWaldzeitMap(new Map());
      return;
    }

    const { data: items, error: itemErr } = await supabase
      .from("work_items")
      .select("id,workday_id,objekt,maschine,maschinenstunden_h,motormanuel_h")
      .in("workday_id", dayIds);

    if (itemErr) return;

    const dayById = new Map(dayRows.map((d) => [d.id, d]));

    const exactMap = new Map<string, WaldzeitMatch>();
    const machineMap = new Map<string, WaldzeitMatch>();

    for (const it of ((items as any[]) ?? [])) {
      const d = dayById.get(it.workday_id);
      if (!d) continue;

      const h = round1(Number(it.maschinenstunden_h ?? 0) + Number(it.motormanuel_h ?? 0)) ?? 0;

      const ref: WorkItemRef = {
        id: it.id,
        workday_id: it.workday_id,
        date: d.date,
        user_id: d.user_id,
        objekt: it.objekt,
        maschine: it.maschine,
        maschinenstunden_h: it.maschinenstunden_h,
        motormanuel_h: it.motormanuel_h,
      };

      const exactKey = makeExactKey(d.date, d.user_id, it.maschine ?? "", it.objekt ?? "");
      const machineKey = makeMachineKey(d.date, d.user_id, it.maschine ?? "");

      const exact = exactMap.get(exactKey) ?? { hours: 0, items: [], matchType: "exact" as const };
      exact.hours = round1(exact.hours + h) ?? 0;
      exact.items.push(ref);
      exactMap.set(exactKey, exact);

      const machine = machineMap.get(machineKey) ?? { hours: 0, items: [], matchType: "machine" as const };
      machine.hours = round1(machine.hours + h) ?? 0;
      machine.items.push(ref);
      machineMap.set(machineKey, machine);
    }

    setExactWaldzeitMap(exactMap);
    setMachineWaldzeitMap(machineMap);
  }

  function findMachineBySerial(serial: string | null) {
    if (!serial) return null;
    return machines.find((m) => norm(m.serial_number) === norm(serial)) ?? null;
  }

  function autoDriver(driverName: string | null) {
    const n = norm(driverName).toLowerCase();
    if (!n) return "";

    const exact = drivers.find((d) => labelDriver(d).toLowerCase() === n);
    if (exact) return exact.user_id;

    const contains = drivers.find((d) => {
      const label = labelDriver(d).toLowerCase();
      return label.includes(n) || n.includes(label);
    });

    return contains?.user_id ?? "";
  }

  function effectiveMachineName(r: KomatsuRow) {
    const corrected = norm(r.corrected_machine_name);
    if (corrected) return corrected;

    const bySerial = findMachineBySerial(r.serial_number);
    return bySerial?.name || norm(r.machine_name);
  }

  function effectiveDriverId(r: KomatsuRow) {
    return r.corrected_driver_id || autoDriver(r.driver_name);
  }

  function effectiveDriverName(r: KomatsuRow) {
    const driverId = effectiveDriverId(r);
    const d = drivers.find((x) => x.user_id === driverId);
    return d ? labelDriver(d) : norm(r.driver_name) || "Ohne Fahrer";
  }

  function effectiveObject(r: KomatsuRow) {
    return norm(r.corrected_object_name) || norm(r.object_name);
  }

  function getWaldzeitMatch(r: KomatsuRow): WaldzeitMatch {
    const driverId = effectiveDriverId(r);
    const machine = effectiveMachineName(r);
    const obj = effectiveObject(r);

    if (!driverId || !machine) {
      return { hours: 0, items: [], matchType: "none" };
    }

    if (obj) {
      const exactKey = makeExactKey(r.date, driverId, machine, obj);
      const exact = exactWaldzeitMap.get(exactKey);
      if (exact) return exact;
    }

    const machineKey = makeMachineKey(r.date, driverId, machine);
    const machineMatch = machineWaldzeitMap.get(machineKey);
    if (machineMatch) return machineMatch;

    return { hours: 0, items: [], matchType: "none" };
  }

  async function updateRow(id: string, patch: Partial<KomatsuRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    const { error } = await supabase.from("komatsu_hours").update(patch).eq("id", id);
    if (error) setMsg("Fehler Speichern: " + error.message);
  }

  async function saveWaldzeitHours(row: KomatsuRow, match: WaldzeitMatch) {
    const raw = waldzeitEdits[row.id];
    const next = toNum(raw);

    if (next === null) {
      setMsg("Bitte eine gültige Waldzeit-Stundenzahl eingeben.");
      return;
    }

    if (match.items.length === 0) {
      setMsg("Keine passende Waldzeit-Zeile gefunden. Bitte zuerst Fahrer/Maschine/Objekt korrekt zuordnen.");
      return;
    }

    const first = match.items[0];
    const rest = match.items.slice(1);

    const restHours = rest.reduce((sum, it) => {
      return sum + Number(it.maschinenstunden_h ?? 0) + Number(it.motormanuel_h ?? 0);
    }, 0);

    const firstNew = round1(next - restHours);
    if (firstNew === null || firstNew < 0) {
      setMsg("Der neue Wert ist kleiner als die Summe der übrigen Waldzeit-Einsätze. Bitte direkt in der Kontrollseite prüfen.");
      return;
    }

    setBusy(true);
    setMsg("Speichere Waldzeit-Stunden...");

    const useMotormanuel = Number(first.motormanuel_h ?? 0) > 0 && Number(first.maschinenstunden_h ?? 0) === 0;

    const payload = useMotormanuel ? { motormanuel_h: firstNew } : { maschinenstunden_h: firstNew };

    const { error } = await supabase.from("work_items").update(payload).eq("id", first.id);

    if (error) {
      setMsg("Fehler Waldzeit speichern: " + error.message);
      setBusy(false);
      return;
    }

    setMsg("✅ Waldzeit-Stunden gespeichert.");
    await buildWaldzeitMaps();
    setBusy(false);
  }

  async function importExcel(file: File) {
    setBusy(true);
    setMsg("Importiere Excel...");

    try {
      const wb = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      const imported: any[] = [];

      let currentSerial = "";
      let currentMachine = "";
      let currentDriver = "";

      ws.eachRow((row) => {
        const vals = row.values as any[];

        const c1 = norm(vals[1]);
        const c2 = norm(vals[2]);
        const c3 = vals[3];
        const c4 = norm(vals[4]);
        const c6 = vals[6];
        const c7 = vals[7];
        const c8 = vals[8];

        const joined = vals.map((x) => norm(x)).join(" ");

        const serialMatch = joined.match(/\b\d{8,12}\b/);
        if (serialMatch && !excelDateToISO(c3)) {
          currentSerial = serialMatch[0];
        }

        if (c1 && !excelDateToISO(c1) && !["maschine", "fahrer", "datum"].includes(c1.toLowerCase())) {
          if (serialMatch) currentMachine = c1;
        }

        if (c2 && !excelDateToISO(c2) && c2.toLowerCase() !== "fahrer") {
          currentDriver = c2;
        }

        const date = excelDateToISO(c1) || excelDateToISO(c3);
        if (!date) return;

        const objectName = c2 && !excelDateToISO(c2) ? c2 : c4;
        const motorRuntime = toNum(c6);
        const effectiveWork = toNum(c7);
        const motorstunden = toNum(c8);

        if (!objectName && motorRuntime === null && effectiveWork === null && motorstunden === null) return;

        const machineHit = findMachineBySerial(currentSerial);

        imported.push({
          import_name: file.name,
          serial_number: currentSerial || null,
          machine_name: currentMachine || machineHit?.name || null,
          corrected_machine_name: machineHit?.name || null,
          driver_name: currentDriver || null,
          corrected_driver_id: autoDriver(currentDriver) || null,
          date,
          object_name: objectName || null,
          corrected_object_name: objectName || null,
          motor_runtime_h: motorRuntime,
          effective_work_h: effectiveWork,
          motorstunden,
          is_checked: false,
        });
      });

      if (imported.length === 0) {
        setMsg("Keine importierbaren Zeilen gefunden. Wahrscheinlich müssen wir die Excel-Struktur genauer anpassen.");
        setBusy(false);
        return;
      }

      const { error } = await supabase.from("komatsu_hours").insert(imported);
      if (error) throw new Error(error.message);

      setMsg(`✅ Import fertig: ${imported.length} Zeilen`);
      await loadRows();
    } catch (e: any) {
      setMsg("Fehler Import: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  const enriched = useMemo<EnrichedRow[]>(() => {
    return rows
      .filter((r) => {
        const komatsu = r.motor_runtime_h ?? r.effective_work_h ?? r.motorstunden ?? null;
        return komatsu !== null && komatsu >= 1;
      })
      .map((r) => {
        const komatsu = r.motor_runtime_h ?? r.effective_work_h ?? r.motorstunden ?? null;
        const match = getWaldzeitMatch(r);
        const wald = match.matchType === "none" ? null : match.hours;
        const diff = komatsu !== null && wald !== null ? round1(wald - komatsu) : null;
        const hasMapping = !!effectiveDriverId(r) && !!effectiveMachineName(r);
        const s = getStatus(diff, hasMapping, match.matchType);

        return {
          r,
          komatsu,
          wald,
          diff,
          statusText: s.text,
          statusClass: s.cls,
          match,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, exactWaldzeitMap, machineWaldzeitMap, drivers, machines]);

  const grouped = useMemo<DriverGroup[]>(() => {
    const map = new Map<string, DriverGroup>();

    for (const e of enriched) {
      const driverId = effectiveDriverId(e.r) || `komatsu_${effectiveDriverName(e.r)}`;
      const driverName = effectiveDriverName(e.r);

      const g = map.get(driverId) ?? {
        driverId,
        driverName,
        rows: [],
      };

      g.rows.push(e);
      map.set(driverId, g);
    }

    const result = Array.from(map.values());

    result.sort((a, b) => a.driverName.localeCompare(b.driverName, "de", { sensitivity: "base" }));

    for (const g of result) {
      g.rows.sort((a, b) => {
        if (a.r.date !== b.r.date) return b.r.date.localeCompare(a.r.date);
        return effectiveMachineName(a.r).localeCompare(effectiveMachineName(b.r), "de", { sensitivity: "base" });
      });
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, drivers]);

  async function markDriverGroupChecked(group: DriverGroup) {
    const ids = group.rows.map((x) => x.r.id);
    if (ids.length === 0) return;

    if (!confirm(`${group.driverName}: ${ids.length} Komatsu-Zeilen als geprüft markieren?`)) return;

    setBusy(true);
    setMsg("Markiere Fahrergruppe als geprüft...");

    const { error } = await supabase.from("komatsu_hours").update({ is_checked: true }).in("id", ids);

    if (error) {
      setMsg("Fehler: " + error.message);
      setBusy(false);
      return;
    }

    setMsg("✅ Fahrergruppe geprüft.");
    await loadRows();
    setBusy(false);
  }

  if (admin === null) {
    return <main className="wrap">Lade…</main>;
  }

  if (!admin) {
    return (
      <main className="wrap">
        <h1>Komatsu</h1>
        <p style={{ color: "crimson" }}>Kein Admin-Zugriff.</p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1 className="h1">Komatsu Abgleich</h1>
          <div className="sub">
            Angemeldet als: <b>{meName || "…"}</b>
          </div>
        </div>

        <div className="topActions">
          <Link href="/admin">
            <button className="btn">Admin</button>
          </Link>
          <Link href="/admin/control">
            <button className="btn">Kontrolle</button>
          </Link>
        </div>
      </header>

      <section className="card compactCard">
        <h2>Import / Filter</h2>

        <div className="filterGrid">
          <label>
            Von
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>

          <label>
            Bis
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>

          <label className="check">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Nur offen
          </label>

          <button onClick={loadRows} disabled={busy} className="btnPrimary">
            {busy ? "Lade..." : "Aktualisieren"}
          </button>

          <label className="upload">
            Excel importieren
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importExcel(f);
              }}
            />
          </label>
        </div>

        {msg && <pre className="msg">{msg}</pre>}
      </section>

      <section className="groups">
        {grouped.map((group, idx) => {
          const badCount = group.rows.filter((x) => x.statusClass === "bad").length;
          const warnCount = group.rows.filter((x) => x.statusClass === "warn").length;
          const okCount = group.rows.filter((x) => x.statusClass === "ok").length;
          const open = openDrivers[group.driverId] ?? idx === 0;

          return (
            <details
              key={group.driverId}
              className="driverGroup"
              open={open}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                setOpenDrivers((prev) => ({
                  ...prev,
                  [group.driverId]: isOpen,
                }));
              }}
            >
              <summary className="driverSummary">
                <span className="plus">＋</span>
                <b>{group.driverName}</b>
                <span className="summaryMeta">
                  {group.rows.length} Zeilen · ✅ {okCount} · ⚠️ {warnCount} · 🔴 {badCount}
                </span>
              </summary>

              <div className="groupActions">
                <button type="button" onClick={() => markDriverGroupChecked(group)} disabled={busy} className="btnPrimary">
                  Fahrer geprüft
                </button>
              </div>

              <div className="rows">
                {group.rows.map(({ r, komatsu, wald, diff, statusText, statusClass, match }) => {
                  const editValue = waldzeitEdits[r.id] ?? toEditValue(wald);
                  const isMachineFallback = match.matchType === "machine";

                  return (
                    <div key={r.id} className={`row ${statusClass}`}>
                      <div className="rowTop">
                        <b>{fmtDE(r.date)}</b>
                        <span>{statusText}</span>
                        <span>
                          Komatsu: <b>{format1(komatsu)}</b> h
                        </span>
                        <span>
                          Waldzeit: <b>{format1(wald)}</b> h
                        </span>
                        <span>
                          Diff: <b>{format1(diff)}</b> h
                        </span>

                        <span className="komatsuObj">
                          Komatsu Objekt: <b>{r.object_name || "-"}</b>
                        </span>

                        {isMachineFallback && <span className="fallback">Objekt-Fallback</span>}
                      </div>

                      <div className="editGrid">
                        <label>
                          Seriennummer
                          <input value={r.serial_number ?? ""} onChange={(e) => updateRow(r.id, { serial_number: e.target.value })} />
                        </label>

                        <label>
                          Maschine
                          <select value={effectiveMachineName(r)} onChange={(e) => updateRow(r.id, { corrected_machine_name: e.target.value })}>
                            <option value="">Bitte wählen…</option>
                            {machines.map((m) => (
                              <option key={m.id} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Fahrer Komatsu
                          <input value={r.driver_name ?? ""} onChange={(e) => updateRow(r.id, { driver_name: e.target.value })} />
                        </label>

                        <label>
                          Fahrer korrigiert
                          <select value={effectiveDriverId(r)} onChange={(e) => updateRow(r.id, { corrected_driver_id: e.target.value || null })}>
                            <option value="">Bitte wählen…</option>
                            {drivers.map((d) => (
                              <option key={d.user_id} value={d.user_id}>
                                {labelDriver(d)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Waldzeit Objekt
                          <select value={effectiveObject(r)} onChange={(e) => updateRow(r.id, { corrected_object_name: e.target.value })}>
                            <option value="">Bitte wählen…</option>
                            {objects.map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Waldzeit h
                          <input
                            value={editValue}
                            inputMode="decimal"
                            onChange={(e) =>
                              setWaldzeitEdits((prev) => ({
                                ...prev,
                                [r.id]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>

                      <div className="matchInfo">
                        {match.items.length > 0 ? (
                          <span>
                            Waldzeit-Treffer: {match.items.length} Einsatz/Einsätze · Match: {match.matchType === "exact" ? "Objekt + Maschine" : "nur Maschine"}
                          </span>
                        ) : (
                          <span>Kein passender Waldzeit-Einsatz gefunden.</span>
                        )}
                      </div>

                      <div className="actions">
                        <button onClick={() => saveWaldzeitHours(r, match)} disabled={busy || match.items.length === 0} className="btn">
                          Waldzeit speichern
                        </button>

                        <button onClick={() => updateRow(r.id, { is_checked: !r.is_checked })} className="btnPrimary">
                          {r.is_checked ? "Wieder öffnen" : "Geprüft"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}

        {grouped.length === 0 && <div className="card">Keine Komatsu-Daten im Zeitraum.</div>}
      </section>

      <style jsx>{`
        .wrap {
          max-width: 1280px;
          margin: 14px auto;
          padding: 8px;
        }

        .head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }

        .h1 {
          margin: 0;
          font-size: 30px;
        }

        .sub {
          opacity: 0.8;
          margin-top: 3px;
        }

        .topActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .card,
        .driverGroup,
        .row {
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 10px;
          background: #fff;
        }

        .compactCard h2 {
          margin: 0 0 8px 0;
        }

        .filterGrid {
          display: grid;
          grid-template-columns: 1fr 1fr auto auto 1.5fr;
          gap: 8px;
          align-items: end;
        }

        label {
          font-weight: 800;
          font-size: 12px;
        }

        input,
        select {
          width: 100%;
          margin-top: 3px;
          padding: 7px;
          border: 1px solid #ddd;
          border-radius: 9px;
          box-sizing: border-box;
          background: #fff;
          font-size: 13px;
        }

        .check {
          display: flex;
          gap: 7px;
          align-items: center;
          border: 1px solid #eee;
          border-radius: 10px;
          padding: 8px;
          font-size: 13px;
        }

        .check input {
          width: auto;
          margin: 0;
        }

        .upload input {
          padding: 7px;
        }

        .btn,
        .btnPrimary {
          border: 1px solid #ddd;
          background: #fff;
          font-weight: 900;
          border-radius: 10px;
          padding: 8px 10px;
          cursor: pointer;
          font-size: 13px;
        }

        .btnPrimary {
          background: #fafafa;
        }

        .msg {
          white-space: pre-wrap;
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 10px;
          padding: 8px;
          margin: 8px 0 0 0;
        }

        .groups {
          display: grid;
          gap: 8px;
          margin-top: 10px;
        }

        .driverGroup {
          padding: 8px;
        }

        .driverSummary {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          list-style: none;
          user-select: none;
          font-size: 17px;
        }

        .driverSummary::-webkit-details-marker {
          display: none;
        }

        .plus {
          display: inline-block;
          transition: transform 0.12s ease;
          font-size: 19px;
        }

        details[open] > .driverSummary .plus {
          transform: rotate(45deg);
        }

        .summaryMeta {
          margin-left: auto;
          opacity: 0.75;
          font-size: 12px;
          font-weight: 800;
        }

        .groupActions {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
        }

        .rows {
          display: grid;
          gap: 7px;
          margin-top: 8px;
        }

        .row {
          padding: 8px;
        }

        .row.ok {
          border-color: #c7f2d5;
        }

        .row.warn {
          border-color: #f1d37a;
          background: #fffdf5;
        }

        .row.bad {
          border-color: #f2c7c7;
          background: #fffafa;
        }

        .rowTop {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          font-size: 13px;
        }

        .komatsuObj {
          background: #f7f7f7;
          border: 1px solid #eee;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 12px;
          font-weight: 800;
        }

        .fallback {
          background: #fff4cc;
          border: 1px solid #f1d37a;
          border-radius: 999px;
          padding: 2px 8px;
          font-weight: 900;
          font-size: 12px;
        }

        .editGrid {
          display: grid;
          grid-template-columns: 0.75fr 0.85fr 1fr 1fr 1.3fr 0.55fr;
          gap: 6px;
          margin-top: 7px;
        }

        .editGrid label {
          font-size: 12px;
        }

        .editGrid input,
        .editGrid select {
          padding: 7px;
          font-size: 13px;
        }

        .matchInfo {
          margin-top: 5px;
          font-size: 12px;
          opacity: 0.75;
          font-weight: 800;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 7px;
          margin-top: 7px;
          flex-wrap: wrap;
        }

        @media (max-width: 1000px) {
          .head {
            flex-direction: column;
          }

          .filterGrid {
            grid-template-columns: 1fr 1fr;
          }

          .upload,
          .btnPrimary {
            grid-column: 1 / -1;
          }

          .editGrid {
            grid-template-columns: 1fr 1fr;
          }

          .summaryMeta {
            width: 100%;
            margin-left: 28px;
          }

          .driverSummary {
            flex-wrap: wrap;
          }
        }

        @media (max-width: 560px) {
          .wrap {
            margin: 8px auto;
            padding: 6px;
          }

          .h1 {
            font-size: 26px;
          }

          .filterGrid,
          .editGrid {
            grid-template-columns: 1fr;
          }

          .rowTop {
            display: grid;
            gap: 4px;
          }

          .actions .btn,
          .actions .btnPrimary {
            width: 100%;
          }

          .groupActions .btnPrimary {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}