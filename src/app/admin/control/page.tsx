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

type OptionRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
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

type DisplayDay = {
  date: string;
  day: ControlDay | null;
};

type DriverWeekGroup = {
  driver: DriverRow;
  driverName: string;
  days: DisplayDay[];
};

type WeekGroup = {
  key: string;
  drivers: DriverWeekGroup[];
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

function round1(v: number | null | undefined) {
  if (v === null || v === undefined) return null;
  return Math.round(v * 10) / 10;
}

function format1(v: number | null | undefined) {
  const r = round1(v);
  if (r === null) return "-";
  return r.toFixed(1);
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

function weekdayDE(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" });
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

function listDatesInRange(from: string, to: string) {
  const result: string[] = [];
  if (!from || !to) return result;

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return result;

  const cur = new Date(start);
  while (cur <= end) {
    result.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

function toEditValue(v: number | null | undefined) {
  const r = round1(v);
  if (r === null) return "";
  return String(r).replace(".", ",");
}

function toNumOrNull(v: string) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return round1(n);
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

function timeDiffHours(start: string | null, end: string | null) {
  if (!start || !end) return null;

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return null;

  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin < startMin) endMin += 24 * 60;

  return round1((endMin - startMin) / 60);
}

function driverLabel(d: DriverRow) {
  return d.full_name?.trim() || d.username?.trim() || d.user_id;
}

export default function AdminControlPage() {
  const [meName, setMeName] = useState("");
  const [admin, setAdmin] = useState<boolean | null>(null);

  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [selectedDriver, setSelectedDriver] = useState("");
  const [onlyUnchecked, setOnlyUnchecked] = useState(true);

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [objects, setObjects] = useState<OptionRow[]>([]);
  const [machines, setMachines] = useState<OptionRow[]>([]);
  const [days, setDays] = useState<ControlDay[]>([]);

  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  const [edits, setEdits] = useState<Record<string, Partial<Record<NumField, string>>>>({});
  const [itemTextEdits, setItemTextEdits] = useState<Record<string, { objekt: string; maschine: string }>>({});
  const [commentEdits, setCommentEdits] = useState<Record<string, string>>({});
  const [dayFlags, setDayFlags] = useState<Record<string, { is_urlaub: boolean; is_wetter: boolean }>>({});

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

    const [dRes, objRes, machRes] = await Promise.all([
      supabase.from("driver_profiles").select("user_id,username,full_name,is_active").order("full_name", { ascending: true }),
      supabase.from("objects").select("id,name,is_active").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("machines").select("id,name,is_active").eq("is_active", true).order("name", { ascending: true }),
    ]);

    if (dRes.error) {
      setBusy(false);
      setMsg("Fehler Fahrer laden: " + dRes.error.message);
      return;
    }

    if (objRes.error) {
      setBusy(false);
      setMsg("Fehler Objekte laden: " + objRes.error.message);
      return;
    }

    if (machRes.error) {
      setBusy(false);
      setMsg("Fehler Maschinen laden: " + machRes.error.message);
      return;
    }

    const driverRows = (((dRes.data as any[]) ?? []) as DriverRow[]).sort(sortByLastname);
    setDrivers(driverRows);
    setObjects(((objRes.data as any[]) ?? []) as OptionRow[]);
    setMachines(((machRes.data as any[]) ?? []) as OptionRow[]);

    const driverMap = new Map<string, string>();
    for (const d of driverRows) driverMap.set(d.user_id, driverLabel(d));

    let q = supabase
      .from("workdays")
      .select("id,user_id,date,arbeitsbeginn,arbeitsende,kommentar,is_urlaub,is_wetter,is_controlled,controlled_at")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });

    if (selectedDriver) q = q.eq("user_id", selectedDriver);

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
          "id,workday_id,objekt,maschine,fahrtzeit_min,mas_start,mas_end,maschinenstunden_h,unterhalt_h,reparatur_h,motormanuel_h,umsetzen_h,sonstiges_h,diesel_l,adblue_l,kommentar,twinch_used,twinch_h"
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
    const nextTextEdits: Record<string, { objekt: string; maschine: string }> = {};

    for (const item of itemRows) {
      nextEdits[item.id] = {};
      for (const f of NUM_FIELDS) nextEdits[item.id]![f] = toEditValue(item[f]);

      nextTextEdits[item.id] = {
        objekt: item.objekt ?? "",
        maschine: item.maschine ?? "",
      };
    }

    const nextComments: Record<string, string> = {};
    const nextFlags: Record<string, { is_urlaub: boolean; is_wetter: boolean }> = {};

    for (const day of finalDays) {
      nextComments[day.id] = day.kommentar ?? "";
      nextFlags[day.id] = {
        is_urlaub: !!day.is_urlaub,
        is_wetter: !!day.is_wetter,
      };
    }

    setDays(finalDays);
    setEdits(nextEdits);
    setItemTextEdits(nextTextEdits);
    setCommentEdits(nextComments);
    setDayFlags(nextFlags);
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

  function updateItemText(itemId: string, field: "objekt" | "maschine", value: string) {
    setItemTextEdits((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { objekt: "", maschine: "" }),
        [field]: value,
      },
    }));
  }

  function updateDayFlag(dayId: string, field: "is_urlaub" | "is_wetter", checked: boolean) {
    setDayFlags((prev) => {
      const current = prev[dayId] ?? { is_urlaub: false, is_wetter: false };

      if (field === "is_urlaub") {
        return {
          ...prev,
          [dayId]: {
            is_urlaub: checked,
            is_wetter: checked ? false : current.is_wetter,
          },
        };
      }

      return {
        ...prev,
        [dayId]: {
          is_urlaub: checked ? false : current.is_urlaub,
          is_wetter: checked,
        },
      };
    });
  }

  function getEdit(item: ItemRow, field: NumField) {
    return edits[item.id]?.[field] ?? toEditValue(item[field]);
  }

  function getItemText(item: ItemRow, field: "objekt" | "maschine") {
    return itemTextEdits[item.id]?.[field] ?? item[field] ?? "";
  }

  function setDayOpen(dayId: string, open: boolean) {
    setOpenDays((prev) => ({
      ...prev,
      [dayId]: open,
    }));
  }

  function sumWorkedHoursLive(items: ItemRow[]) {
    const total = items.reduce((sum, it) => {
      return (
        sum +
        (toNumOrNull(getEdit(it, "maschinenstunden_h")) ?? 0) +
        (toNumOrNull(getEdit(it, "unterhalt_h")) ?? 0) +
        (toNumOrNull(getEdit(it, "reparatur_h")) ?? 0) +
        (toNumOrNull(getEdit(it, "motormanuel_h")) ?? 0) +
        (toNumOrNull(getEdit(it, "umsetzen_h")) ?? 0) +
        (toNumOrNull(getEdit(it, "sonstiges_h")) ?? 0)
      );
    }, 0);

    return round1(total) ?? 0;
  }

  async function createDayAndItem(driver: DriverRow, date: string) {
    const defaultObject = objects[0]?.name ?? "";
    const defaultMachine = machines[0]?.name ?? "";

    if (!defaultObject) {
      setMsg("Fehler: Kein aktives Objekt vorhanden. Bitte zuerst ein Objekt anlegen.");
      return;
    }

    if (!defaultMachine) {
      setMsg("Fehler: Keine aktive Maschine vorhanden. Bitte zuerst eine Maschine anlegen.");
      return;
    }

    setBusy(true);
    setMsg("Tag und Einsatz werden angelegt...");

    try {
      const { data: dayData, error: dayErr } = await supabase
        .from("workdays")
        .insert({
          user_id: driver.user_id,
          date,
          arbeitsbeginn: null,
          arbeitsende: null,
          kommentar: null,
          is_urlaub: false,
          is_wetter: false,
          is_controlled: false,
          controlled_at: null,
        })
        .select("id")
        .single();

      if (dayErr) throw new Error(dayErr.message);

      const { error: itemErr } = await supabase.from("work_items").insert({
        workday_id: dayData.id,
        objekt: defaultObject,
        maschine: defaultMachine,
        fahrtzeit_min: null,
        mas_start: null,
        mas_end: null,
        maschinenstunden_h: null,
        unterhalt_h: null,
        reparatur_h: null,
        motormanuel_h: null,
        umsetzen_h: null,
        sonstiges_h: null,
        diesel_l: null,
        adblue_l: null,
        kommentar: null,
        twinch_used: false,
        twinch_h: null,
      });

      if (itemErr) throw new Error(itemErr.message);

      setDayOpen(dayData.id, true);
      setMsg("✅ Tag und Einsatz angelegt.");
      await loadData();
    } catch (e: any) {
      setMsg("Fehler: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function addItemToDay(day: ControlDay) {
    const defaultObject = objects[0]?.name ?? "";
    const defaultMachine = machines[0]?.name ?? "";

    if (!defaultObject) {
      setMsg("Fehler: Kein aktives Objekt vorhanden. Bitte zuerst ein Objekt anlegen.");
      return;
    }

    if (!defaultMachine) {
      setMsg("Fehler: Keine aktive Maschine vorhanden. Bitte zuerst eine Maschine anlegen.");
      return;
    }

    setBusy(true);
    setMsg("Einsatz wird hinzugefügt...");

    try {
      const { error: dayErr } = await supabase
        .from("workdays")
        .update({
          is_urlaub: false,
          is_wetter: false,
          is_controlled: false,
          controlled_at: null,
        })
        .eq("id", day.id);

      if (dayErr) throw new Error(dayErr.message);

      const { error: itemErr } = await supabase.from("work_items").insert({
        workday_id: day.id,
        objekt: defaultObject,
        maschine: defaultMachine,
        fahrtzeit_min: null,
        mas_start: null,
        mas_end: null,
        maschinenstunden_h: null,
        unterhalt_h: null,
        reparatur_h: null,
        motormanuel_h: null,
        umsetzen_h: null,
        sonstiges_h: null,
        diesel_l: null,
        adblue_l: null,
        kommentar: null,
        twinch_used: false,
        twinch_h: null,
      });

      if (itemErr) throw new Error(itemErr.message);

      setDayOpen(day.id, true);
      setMsg("✅ Einsatz hinzugefügt. Bitte Objekt/Maschine prüfen.");
      await loadData();
    } catch (e: any) {
      setMsg("Fehler: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(item: ItemRow) {
    const e = edits[item.id] ?? {};
    const t = itemTextEdits[item.id] ?? { objekt: item.objekt ?? "", maschine: item.maschine ?? "" };

    const payload: Record<string, any> = {
      objekt: t.objekt?.trim() || null,
      maschine: t.maschine?.trim() || null,
    };

    for (const f of NUM_FIELDS) payload[f] = toNumOrNull(e[f] ?? toEditValue(item[f]));

    const { error } = await supabase.from("work_items").update(payload).eq("id", item.id);
    if (error) throw new Error(error.message);
  }

  async function saveDayInternal(day: ControlDay, markControlled: boolean) {
    for (const item of day.items) await saveItem(item);

    const flags = dayFlags[day.id] ?? {
      is_urlaub: !!day.is_urlaub,
      is_wetter: !!day.is_wetter,
    };

    const payload: Record<string, any> = {
      kommentar: commentEdits[day.id]?.trim() || null,
      is_urlaub: !!flags.is_urlaub,
      is_wetter: !!flags.is_wetter,
    };

    if (markControlled) {
      payload.is_controlled = true;
      payload.controlled_at = new Date().toISOString();
    }

    const { error } = await supabase.from("workdays").update(payload).eq("id", day.id);
    if (error) throw new Error(error.message);
  }

  async function saveDayAndMarkControlled(day: ControlDay) {
    if (!confirm(`${fmtDE(day.date)} von ${day.driverName} speichern und als kontrolliert markieren?`)) return;

    setBusy(true);
    setMsg("Speichere Kontrolle...");

    try {
      await saveDayInternal(day, true);
      setDayOpen(day.id, false);
      setMsg("✅ Gespeichert und als kontrolliert markiert.");
      await loadData();
    } catch (e: any) {
      setMsg("Fehler: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function saveWeekAndMarkControlled(group: DriverWeekGroup, weekKey: string) {
    const existingDays = group.days.map((x) => x.day).filter(Boolean) as ControlDay[];

    if (existingDays.length === 0) {
      setMsg("Keine vorhandenen Tage in dieser Woche zum Speichern.");
      return;
    }

    if (!confirm(`${weekKey} für ${group.driverName} speichern und als kontrolliert markieren?\n\nVorhandene Tage: ${existingDays.length}`)) return;

    setBusy(true);
    setMsg("Speichere Woche...");

    try {
      for (const day of existingDays) {
        await saveDayInternal(day, true);
      }

      setOpenDays((prev) => {
        const next = { ...prev };
        for (const day of existingDays) next[day.id] = false;
        return next;
      });

      setMsg(`✅ ${weekKey} für ${group.driverName} gespeichert und kontrolliert.`);
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

  const grouped = useMemo<WeekGroup[]>(() => {
    const allDates = listDatesInRange(from, to);
    const weekDateMap = new Map<string, string[]>();

    for (const date of allDates) {
      const key = isoWeekKey(date);
      const arr = weekDateMap.get(key) ?? [];
      arr.push(date);
      weekDateMap.set(key, arr);
    }

    const actualByDriverDate = new Map<string, ControlDay>();
    for (const d of days) {
      actualByDriverDate.set(`${d.user_id}__${d.date}`, d);
    }

    const relevantDrivers = (selectedDriver ? drivers.filter((d) => d.user_id === selectedDriver) : drivers).filter((d) => d.is_active !== false);

    const weekKeys = Array.from(weekDateMap.keys()).sort((a, b) => (a < b ? 1 : -1));
    const result: WeekGroup[] = [];

    for (const weekKey of weekKeys) {
      const weekDates = (weekDateMap.get(weekKey) ?? []).sort((a, b) => a.localeCompare(b));
      const driverGroups: DriverWeekGroup[] = [];

      for (const driver of relevantDrivers) {
        const displayDays: DisplayDay[] = weekDates.map((date) => ({
          date,
          day: actualByDriverDate.get(`${driver.user_id}__${date}`) ?? null,
        }));

        const hasAnyActualDay = displayDays.some((x) => !!x.day);
        const hasUncheckedDay = displayDays.some((x) => x.day && !x.day.is_controlled);

        if (onlyUnchecked) {
          if (!hasUncheckedDay) continue;
        } else {
          if (!hasAnyActualDay && !selectedDriver) continue;
        }

        driverGroups.push({
          driver,
          driverName: driverLabel(driver),
          days: displayDays,
        });
      }

      if (driverGroups.length > 0) {
        result.push({
          key: weekKey,
          drivers: driverGroups,
        });
      }
    }

    return result;
  }, [days, drivers, from, to, selectedDriver, onlyUnchecked]);

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

      <section className="card compactCard">
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
                  {driverLabel(d)}
                </option>
              ))}
            </select>
          </label>

          <label className="checkBox">
            <input type="checkbox" checked={onlyUnchecked} onChange={(e) => setOnlyUnchecked(e.target.checked)} />
            Nur offen
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
            </summary>

            <div className="drivers">
              {w.drivers.map((driverGroup) => {
                const existingDays = driverGroup.days.filter((x) => !!x.day).length;
                const uncheckedDays = driverGroup.days.filter((x) => x.day && !x.day.is_controlled).length;

                return (
                  <details key={`${w.key}-${driverGroup.driver.user_id}`} className="driverCard" open>
                    <summary className="driverSummary">
                      <span className="plus">＋</span>
                      <span>{driverGroup.driverName}</span>
                      <span className="driverMeta">
                        {existingDays} Einträge · {uncheckedDays} offen
                      </span>
                    </summary>

                    <div className="weekActions">
                      <button type="button" onClick={() => saveWeekAndMarkControlled(driverGroup, w.key)} disabled={busy} className="btnPrimary">
                        Woche kontrolliert
                      </button>
                    </div>

                    <div className="days">
                      {driverGroup.days.map((display) => {
                        const d = display.day;

                        if (!d) {
                          return (
                            <div key={display.date} className="missingDay">
                              <div>
                                <b>
                                  {weekdayDE(display.date)} {fmtDE(display.date)}
                                </b>
                                <div style={{ opacity: 0.7, fontSize: 12 }}>Kein Eintrag</div>
                              </div>

                              <button type="button" onClick={() => createDayAndItem(driverGroup.driver, display.date)} disabled={busy} className="btn">
                                + Eintrag
                              </button>
                            </div>
                          );
                        }

                        const arbeitszeit = timeDiffHours(d.arbeitsbeginn, d.arbeitsende);
                        const geleistet = sumWorkedHoursLive(d.items);
                        const diff = arbeitszeit === null ? null : round1(geleistet - arbeitszeit);
                        const flags = dayFlags[d.id] ?? { is_urlaub: !!d.is_urlaub, is_wetter: !!d.is_wetter };
                        const isOpen = openDays[d.id] ?? false;

                        return (
                          <details
                            key={d.id}
                            className={d.is_controlled ? "dayCard controlled" : "dayCard"}
                            open={isOpen}
                            onToggle={(e) => setDayOpen(d.id, (e.currentTarget as HTMLDetailsElement).open)}
                          >
                            <summary className="daySummary">
                              <div className="dayMain">
                                <b>
                                  {weekdayDE(d.date)} {fmtDE(d.date)}
                                </b>
                                <span className="miniStats">
                                  AZ {format1(arbeitszeit)}h · Leist. {format1(geleistet)}h · Diff {format1(diff)}h
                                </span>
                              </div>

                              <div className="badges">
                                {flags.is_urlaub && <span className="badge green">Urlaub</span>}
                                {flags.is_wetter && <span className="badge blue">Wetter</span>}
                                {d.is_controlled && <span className="badge done">OK</span>}
                              </div>
                            </summary>

                            <div className="compareBox">
                              <div>
                                <b>Arbeitszeit</b>
                                <br />
                                {format1(arbeitszeit)} h{" "}
                                <span className="small">
                                  {d.arbeitsbeginn || "--:--"} - {d.arbeitsende || "--:--"}
                                </span>
                              </div>
                              <div>
                                <b>Geleistet</b>
                                <br />
                                {format1(geleistet)} h <span className="small">ohne Fahrt</span>
                              </div>
                              <div className={diff !== null && Math.abs(diff) > 0.25 ? "diffWarn" : "diffOk"}>
                                <b>Differenz</b>
                                <br />
                                {format1(diff)} h
                              </div>
                            </div>

                            <div className="flagsRow">
                              <label className="flagBox">
                                <input type="checkbox" checked={flags.is_urlaub} onChange={(e) => updateDayFlag(d.id, "is_urlaub", e.target.checked)} />
                                Urlaub
                              </label>

                              <label className="flagBox">
                                <input type="checkbox" checked={flags.is_wetter} onChange={(e) => updateDayFlag(d.id, "is_wetter", e.target.checked)} />
                                Wetter
                              </label>

                              <button type="button" onClick={() => addItemToDay(d)} disabled={busy} className="btn">
                                + Einsatz hinzufügen
                              </button>
                            </div>

                            <label className="commentEdit">
                              Tageskommentar
                              <textarea
                                value={commentEdits[d.id] ?? ""}
                                onChange={(e) =>
                                  setCommentEdits((prev) => ({
                                    ...prev,
                                    [d.id]: e.target.value,
                                  }))
                                }
                                placeholder="Tageskommentar..."
                              />
                            </label>

                            {d.items.length === 0 ? (
                              <div className="empty">Keine Einsätze</div>
                            ) : (
                              <div className="items">
                                {d.items.map((it, itemIdx) => (
                                  <div key={it.id} className="itemRow">
                                    <div className="itemHead">
                                      <b>Einsatz {itemIdx + 1}</b>
                                    </div>

                                    <div className="selectGrid">
                                      <label className="selectField">
                                        Objekt
                                        <select value={getItemText(it, "objekt")} onChange={(e) => updateItemText(it.id, "objekt", e.target.value)}>
                                          <option value="">Ohne Objekt</option>
                                          {objects.map((o) => (
                                            <option key={o.id} value={o.name}>
                                              {o.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>

                                      <label className="selectField">
                                        Maschine
                                        <select value={getItemText(it, "maschine")} onChange={(e) => updateItemText(it.id, "maschine", e.target.value)}>
                                          <option value="">Ohne Maschine</option>
                                          {machines.map((m) => (
                                            <option key={m.id} value={m.name}>
                                              {m.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    </div>

                                    <div className="editGrid">
                                      <NumberInput label="Fahrt" value={getEdit(it, "fahrtzeit_min")} onChange={(v) => updateEdit(it.id, "fahrtzeit_min", v)} />
                                      <NumberInput label="MAS Start" value={getEdit(it, "mas_start")} onChange={(v) => updateEdit(it.id, "mas_start", v)} />
                                      <NumberInput label="MAS Ende" value={getEdit(it, "mas_end")} onChange={(v) => updateEdit(it.id, "mas_end", v)} />
                                      <NumberInput label="MAS h" value={getEdit(it, "maschinenstunden_h")} onChange={(v) => updateEdit(it.id, "maschinenstunden_h", v)} />
                                      <NumberInput label="Unterh." value={getEdit(it, "unterhalt_h")} onChange={(v) => updateEdit(it.id, "unterhalt_h", v)} />
                                      <NumberInput label="Rep." value={getEdit(it, "reparatur_h")} onChange={(v) => updateEdit(it.id, "reparatur_h", v)} />
                                      <NumberInput label="Motor." value={getEdit(it, "motormanuel_h")} onChange={(v) => updateEdit(it.id, "motormanuel_h", v)} />
                                      <NumberInput label="Umsetz." value={getEdit(it, "umsetzen_h")} onChange={(v) => updateEdit(it.id, "umsetzen_h", v)} />
                                      <NumberInput label="Sonst." value={getEdit(it, "sonstiges_h")} onChange={(v) => updateEdit(it.id, "sonstiges_h", v)} />
                                      <NumberInput label="Diesel" value={getEdit(it, "diesel_l")} onChange={(v) => updateEdit(it.id, "diesel_l", v)} />
                                      <NumberInput label="AdBlue" value={getEdit(it, "adblue_l")} onChange={(v) => updateEdit(it.id, "adblue_l", v)} />
                                      <NumberInput label="Twinch" value={getEdit(it, "twinch_h")} onChange={(v) => updateEdit(it.id, "twinch_h", v)} />
                                    </div>
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
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
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
.wrap{max-width:1080px;margin:18px auto;padding:8px}
.head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.h1{margin:0;font-size:32px;line-height:1.1}
.h2{margin:0 0 8px 0;font-size:20px}
.sub{opacity:.82;margin-top:4px}
.topActions{display:flex;gap:8px;flex-wrap:wrap}
.btn,.btnPrimary{border:1px solid #ddd;background:#fff;font-weight:800;cursor:pointer}
.btn{padding:8px 10px;border-radius:10px}
.btnPrimary{padding:10px 12px;border-radius:10px;font-weight:900}
.card,.weekCard,.dayCard,.driverCard{border:1px solid #eee;border-radius:14px;padding:10px;background:#fff}
.card{margin-top:10px}
.compactCard{padding:10px}
.filterGrid{display:grid;grid-template-columns:1fr 1fr 1.3fr auto auto;gap:8px;align-items:end}
.field{display:block;font-size:13px;font-weight:800}
.control{width:100%;padding:9px;font-size:15px;margin-top:4px;border-radius:10px;border:1px solid #d9d9d9;background:#fff;box-sizing:border-box}
.checkBox{display:flex;gap:8px;align-items:center;border:1px solid #eee;border-radius:10px;padding:9px;font-weight:800;background:#fff;font-size:14px}
.msg{margin-top:8px;white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:10px;padding:8px;font-size:13px}
.bad{color:crimson;font-weight:800}
.weeks{display:grid;gap:10px;margin-top:10px}
.weekSummary,.daySummary,.driverSummary{cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:900;list-style:none;user-select:none}
.weekSummary::-webkit-details-marker,.daySummary::-webkit-details-marker,.driverSummary::-webkit-details-marker{display:none}
.plus{display:inline-block;transition:transform .12s ease;font-size:19px}
details[open]>.weekSummary .plus,details[open]>.daySummary .plus,details[open]>.driverSummary .plus{transform:rotate(45deg)}
.drivers,.days{display:grid;gap:8px;margin-top:8px}
.driverCard{background:#fcfcfc;padding:9px}
.driverMeta{margin-left:auto;font-size:12px;opacity:.7}
.weekActions{margin-top:8px;display:flex;justify-content:flex-end}
.dayCard{padding:8px}
.dayCard.controlled{background:#fbfffb;border-color:#c7f2d5}
.missingDay{border:1px dashed #ddd;border-radius:12px;padding:8px;background:#fafafa;display:flex;justify-content:space-between;gap:8px;opacity:.78;font-size:14px}
.daySummary{justify-content:space-between}
.dayMain{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.miniStats{font-size:12px;opacity:.7;font-weight:800}
.badges{display:flex;gap:5px;flex-wrap:wrap}
.badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:900}
.badge.green{background:#ecfdf3;border:1px solid #c7f2d5}
.badge.blue{background:#eef6ff;border:1px solid #cfe4ff}
.badge.done{background:#e2f0d9;border:1px solid #b6d7a8}
.compareBox{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px;border:1px solid #eee;border-radius:10px;padding:8px;background:#fafafa;font-size:13px}
.diffWarn{color:crimson;font-weight:900}
.diffOk{color:green;font-weight:900}
.small{font-size:11px;opacity:.72}
.flagsRow{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.flagBox{display:flex;gap:6px;align-items:center;border:1px solid #eee;border-radius:10px;padding:7px 10px;background:#fff;font-weight:900;font-size:13px}
.commentEdit{display:block;margin-top:8px;font-weight:800;font-size:13px}
.commentEdit textarea{width:100%;min-height:54px;margin-top:4px;padding:8px;border:1px solid #ddd;border-radius:10px;font-size:14px;box-sizing:border-box}
.items{display:grid;gap:7px;margin-top:8px}
.itemRow{border:1px solid #eee;border-radius:10px;padding:8px;background:#fafafa}
.itemHead{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:14px}
.selectGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}
.selectField{font-size:11px;font-weight:900}
.selectField select{width:100%;margin-top:3px;padding:7px;border:1px solid #ddd;border-radius:9px;font-size:14px;box-sizing:border-box;background:#fff}
.editGrid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:7px}
.numField{font-size:11px;font-weight:800;opacity:.95}
.numField input{width:100%;margin-top:3px;padding:7px;border:1px solid #ddd;border-radius:9px;font-size:14px;box-sizing:border-box;background:#fff}
.empty{margin-top:8px;opacity:.65;font-size:13px}
.dayActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
@media(max-width:800px){
  .wrap{margin:10px auto;padding:6px}
  .h1{font-size:26px}
  .head{flex-direction:column;align-items:stretch}
  .topActions{gap:6px}
  .topActions .btn{flex:1}
  .filterGrid{grid-template-columns:1fr 1fr}
  .filterGrid .field:nth-child(3),.filterGrid .checkBox,.filterGrid .btnPrimary{grid-column:1 / -1}
  .weekCard,.driverCard,.dayCard,.card{padding:8px;border-radius:12px}
  .driverSummary{flex-wrap:wrap}
  .driverMeta{width:100%;margin-left:28px}
  .weekActions .btnPrimary{width:100%}
  .daySummary{align-items:flex-start;gap:6px}
  .dayMain{display:grid;gap:2px}
  .miniStats{font-size:11px}
  .badges{justify-content:flex-start}
  .compareBox{grid-template-columns:1fr 1fr 1fr;font-size:12px;padding:6px}
  .selectGrid{grid-template-columns:1fr}
  .editGrid{grid-template-columns:repeat(3,1fr)}
  .dayActions .btn,.dayActions .btnPrimary{width:100%}
  .missingDay{font-size:13px;padding:7px}
}
@media(max-width:430px){
  .filterGrid{grid-template-columns:1fr}
  .compareBox{grid-template-columns:1fr}
  .editGrid{grid-template-columns:repeat(2,1fr)}
  .btn,.btnPrimary{padding:9px 10px}
  .weekSummary,.driverSummary{font-size:15px}
}
`;