"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type Driver = { user_id: string; full_name: string | null; username: string | null; is_active: boolean | null };
type Option = { id: string; name: string; serial_number?: string | null; is_active?: boolean | null };

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
  note: string | null;
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

function toNum(v: any) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return round1(v);
  const s = String(v).replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? round1(n) : null;
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

function status(diff: number | null, hasMapping: boolean) {
  if (!hasMapping) return "❓ Zuordnung fehlt";
  if (diff === null) return "❓ Keine Waldzeit";
  const a = Math.abs(diff);
  if (a <= 0.2) return "✅ OK";
  if (a <= 0.5) return "⚠️ Prüfen";
  return "🔴 Fehler";
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

  const [waldzeitMap, setWaldzeitMap] = useState<Map<string, number>>(new Map());
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
      return;
    }

    const r = ((data as any[]) ?? []) as KomatsuRow[];
    setRows(r);
    await buildWaldzeitMap(r);
    setMsg("");
  }

  async function buildWaldzeitMap(komatsuRows: KomatsuRow[]) {
    const { data: days, error: dayErr } = await supabase
      .from("workdays")
      .select("id,user_id,date")
      .gte("date", from)
      .lte("date", to);

    if (dayErr) return;

    const dayRows = ((days as any[]) ?? []) as { id: string; user_id: string; date: string }[];
    const dayIds = dayRows.map((d) => d.id);
    if (dayIds.length === 0) {
      setWaldzeitMap(new Map());
      return;
    }

    const { data: items, error: itemErr } = await supabase
      .from("work_items")
      .select("workday_id,objekt,maschine,maschinenstunden_h,motormanuel_h")
      .in("workday_id", dayIds);

    if (itemErr) return;

    const dayById = new Map(dayRows.map((d) => [d.id, d]));
    const map = new Map<string, number>();

    for (const it of ((items as any[]) ?? [])) {
      const d = dayById.get(it.workday_id);
      if (!d) continue;

      const key = [
        d.date,
        d.user_id,
        norm(it.maschine).toLowerCase(),
        norm(it.objekt).toLowerCase(),
      ].join("__");

      const h = Number(it.maschinenstunden_h ?? 0) + Number(it.motormanuel_h ?? 0);
      map.set(key, round1((map.get(key) ?? 0) + h) ?? 0);
    }

    setWaldzeitMap(map);
  }

  function findMachineBySerial(serial: string | null) {
    if (!serial) return null;
    return machines.find((m) => norm(m.serial_number) === norm(serial)) ?? null;
  }

  function autoDriver(driverName: string | null) {
    const n = norm(driverName).toLowerCase();
    if (!n) return "";
    const hit = drivers.find((d) => labelDriver(d).toLowerCase() === n);
    return hit?.user_id ?? "";
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

  function effectiveObject(r: KomatsuRow) {
    return norm(r.corrected_object_name) || norm(r.object_name);
  }

  function getWaldzeitHours(r: KomatsuRow) {
    const driverId = effectiveDriverId(r);
    const machine = effectiveMachineName(r);
    const obj = effectiveObject(r);
    if (!driverId || !machine || !obj) return null;

    const key = [r.date, driverId, machine.toLowerCase(), obj.toLowerCase()].join("__");
    return waldzeitMap.get(key) ?? null;
  }

  async function updateRow(id: string, patch: Partial<KomatsuRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    const { error } = await supabase.from("komatsu_hours").update(patch).eq("id", id);
    if (error) setMsg("Fehler Speichern: " + error.message);
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
        const c5 = vals[5];
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
          note: null,
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

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const komatsu = r.motor_runtime_h ?? r.effective_work_h ?? r.motorstunden ?? null;
      const wald = getWaldzeitHours(r);
      const diff = komatsu !== null && wald !== null ? round1(wald - komatsu) : null;
      const hasMapping = !!effectiveDriverId(r) && !!effectiveMachineName(r) && !!effectiveObject(r);
      return { r, komatsu, wald, diff, status: status(diff, hasMapping) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, waldzeitMap, drivers, machines]);

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

      <section className="card">
        <h2>Import / Filter</h2>

        <div className="grid">
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
            Aktualisieren
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

      <section className="list">
        {enriched.map(({ r, komatsu, wald, diff, status }) => (
          <div key={r.id} className={status.includes("🔴") ? "row bad" : status.includes("⚠️") || status.includes("❓") ? "row warn" : "row ok"}>
            <div className="rowTop">
              <b>{fmtDE(r.date)}</b>
              <span>{status}</span>
              <span>Komatsu: <b>{komatsu ?? "-"}</b> h</span>
              <span>Waldzeit: <b>{wald ?? "-"}</b> h</span>
              <span>Diff: <b>{diff ?? "-"}</b> h</span>
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
                    <option key={m.id} value={m.name}>{m.name}</option>
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
                    <option key={d.user_id} value={d.user_id}>{labelDriver(d)}</option>
                  ))}
                </select>
              </label>

              <label>
                Objekt
                <select value={effectiveObject(r)} onChange={(e) => updateRow(r.id, { corrected_object_name: e.target.value })}>
                  <option value="">Bitte wählen…</option>
                  {objects.map((o) => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Notiz
                <input value={r.note ?? ""} onChange={(e) => updateRow(r.id, { note: e.target.value })} />
              </label>
            </div>

            <div className="actions">
              <button onClick={() => updateRow(r.id, { is_checked: !r.is_checked })} className="btnPrimary">
                {r.is_checked ? "Wieder öffnen" : "Geprüft"}
              </button>
            </div>
          </div>
        ))}

        {enriched.length === 0 && <div className="card">Keine Komatsu-Daten im Zeitraum.</div>}
      </section>

      <style jsx>{`
        .wrap{max-width:1180px;margin:18px auto;padding:10px}
        .head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
        .h1{margin:0;font-size:32px}
        .sub{opacity:.8;margin-top:4px}
        .topActions{display:flex;gap:8px;flex-wrap:wrap}
        .card,.row{border:1px solid #eee;border-radius:14px;padding:12px;background:#fff}
        .grid{display:grid;grid-template-columns:1fr 1fr auto auto 1.5fr;gap:10px;align-items:end}
        label{font-weight:800;font-size:13px}
        input,select{width:100%;margin-top:4px;padding:9px;border:1px solid #ddd;border-radius:10px;box-sizing:border-box;background:#fff}
        .check{display:flex;gap:8px;align-items:center;border:1px solid #eee;border-radius:10px;padding:9px}
        .check input{width:auto;margin:0}
        .upload input{padding:8px}
        .btn,.btnPrimary{border:1px solid #ddd;background:#fff;font-weight:900;border-radius:10px;padding:9px 11px;cursor:pointer}
        .btnPrimary{background:#fafafa}
        .msg{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:10px;padding:8px}
        .list{display:grid;gap:10px;margin-top:12px}
        .row.ok{border-color:#c7f2d5}
        .row.warn{border-color:#f1d37a;background:#fffdf5}
        .row.bad{border-color:#f2c7c7;background:#fffafa}
        .rowTop{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:14px}
        .editGrid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr;gap:8px;margin-top:10px}
        .actions{display:flex;justify-content:flex-end;margin-top:10px}
        @media(max-width:900px){
          .head{flex-direction:column}
          .grid{grid-template-columns:1fr 1fr}
          .upload,.btnPrimary{grid-column:1 / -1}
          .editGrid{grid-template-columns:1fr 1fr}
        }
        @media(max-width:520px){
          .grid,.editGrid{grid-template-columns:1fr}
          .rowTop{display:grid;gap:5px}
        }
      `}</style>
    </main>
  );
}