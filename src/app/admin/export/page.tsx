"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type ExportMode =
  | "machine_range"
  | "driver_range"
  | "machine_object"
  | "driver_object"
  | "all_range"
  | "all_object"
  | "monthly_driver_tables";

type DriverRow = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  default_machine: string | null;
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

type DriverOption = {
  id: string;
  label: string;
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
  return s.replace(/[^\w.\-ÄÖÜäöüß]/g, "_").replace(/_+/g, "_");
}

function excelValue(v: any) {
  if (v === null || v === undefined) return "";
  return v;
}

function listDatesInRange(from: string, to: string) {
  const result: string[] = [];
  if (!from || !to) return result;

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return result;

  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    result.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

function sortByLastnameLabel(a: DriverOption, b: DriverOption) {
  const getLastName = (label: string) => {
    const parts = String(label || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return parts.length === 0 ? "" : parts[parts.length - 1].toLowerCase();
  };

  const lastA = getLastName(a.label);
  const lastB = getLastName(b.label);

  const cmpLast = lastA.localeCompare(lastB, "de", { sensitivity: "base" });
  if (cmpLast !== 0) return cmpLast;

  return String(a.label || "").localeCompare(String(b.label || ""), "de", {
    sensitivity: "base",
  });
}

function isWeekendISO(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

const SHEET_HEADERS = [
  "Datum",
  "Objekt",
  "Maschine",
  "Fahrtzeit [min]",
  "MAS",
  "Unterhalt",
  "Reparatur",
  "Motormanuel",
  "Umsetzen",
  "Sonstiges",
  "Beschreibung",
  "Arbeitstag",
  "Urlaub",
  "Wetter",
  "Twinch",
  "Beginn",
  "Ende",
  "MAS Start",
  "MAS Ende",
  "Diesel",
  "Adblue",
  "Tageskommentar",
  "Einsatzkommentar",
] as const;

type SheetHeader = (typeof SHEET_HEADERS)[number];

function makeRow(values?: Partial<Record<SheetHeader, any>>) {
  return {
    Datum: "",
    Objekt: "",
    Maschine: "",
    "Fahrtzeit [min]": "",
    MAS: "",
    Unterhalt: "",
    Reparatur: "",
    Motormanuel: "",
    Umsetzen: "",
    Sonstiges: "",
    Beschreibung: "",
    Arbeitstag: "",
    Urlaub: "",
    Wetter: "",
    Twinch: "",
    Beginn: "",
    Ende: "",
    "MAS Start": "",
    "MAS Ende": "",
    Diesel: "",
    Adblue: "",
    Tageskommentar: "",
    Einsatzkommentar: "",
    ...(values || {}),
  };
}

function hasWorkedDay(day: DayRow | undefined, item?: ItemRow | null) {
  const hasDayTime = !!(day?.arbeitsbeginn || day?.arbeitsende);
  const hasDayComment = !!String(day?.kommentar || "").trim();

  const hasItemData =
    !!item &&
    (!!String(item.objekt || "").trim() ||
      !!String(item.maschine || "").trim() ||
      item.fahrtzeit_min !== null ||
      item.mas_start !== null ||
      item.mas_end !== null ||
      item.maschinenstunden_h !== null ||
      item.unterhalt_h !== null ||
      item.reparatur_h !== null ||
      item.motormanuel_h !== null ||
      item.umsetzen_h !== null ||
      item.sonstiges_h !== null ||
      !!String(item.sonstiges_beschreibung || "").trim() ||
      item.diesel_l !== null ||
      item.adblue_l !== null ||
      !!String(item.kommentar || "").trim() ||
      item.twinch_h !== null);

  return hasDayTime || hasDayComment || hasItemData;
}

function buildExportRows(
  days: DayRow[],
  items: ItemRow[],
  driverMap: Map<string, string>,
  hasItemFilter: boolean
) {
  const dayMap = new Map<string, DayRow>(days.map((d) => [d.id, d]));
  const workedDaySeen = new Set<string>();

  const itemRows: Array<Record<string, any>> = items.map((it) => {
    const d = dayMap.get(it.workday_id);
    const drvName = d?.user_id ? driverMap.get(d.user_id) ?? "" : "";

    const dayKey = d ? `${d.user_id}__${d.date}` : "";
    const arbeitstag =
      dayKey && hasWorkedDay(d, it) && !workedDaySeen.has(dayKey) ? 1 : "";

    if (arbeitstag === 1) {
      workedDaySeen.add(dayKey);
    }

    return {
      driver: excelValue(drvName),
      ...makeRow({
        Datum: excelValue(d?.date ?? ""),
        Objekt: excelValue(it.objekt ?? ""),
        Maschine: excelValue(it.maschine ?? ""),
        "Fahrtzeit [min]": excelValue(it.fahrtzeit_min ?? ""),
        MAS: excelValue(it.maschinenstunden_h ?? ""),
        Unterhalt: excelValue(it.unterhalt_h ?? ""),
        Reparatur: excelValue(it.reparatur_h ?? ""),
        Motormanuel: excelValue(it.motormanuel_h ?? ""),
        Umsetzen: excelValue(it.umsetzen_h ?? ""),
        Sonstiges: excelValue(it.sonstiges_h ?? ""),
        Beschreibung: excelValue(it.sonstiges_beschreibung ?? ""),
        Arbeitstag: arbeitstag,
        Urlaub: excelValue(d?.is_urlaub ?? false),
        Wetter: excelValue(d?.is_wetter ?? false),
        Twinch: excelValue(it.twinch_h ?? ""),
        Beginn: excelValue(d?.arbeitsbeginn ?? ""),
        Ende: excelValue(d?.arbeitsende ?? ""),
        "MAS Start": excelValue(it.mas_start ?? ""),
        "MAS Ende": excelValue(it.mas_end ?? ""),
        Diesel: excelValue(it.diesel_l ?? ""),
        Adblue: excelValue(it.adblue_l ?? ""),
        Tageskommentar: excelValue(d?.kommentar ?? ""),
        Einsatzkommentar: excelValue(it.kommentar ?? ""),
      }),
    };
  });

  const specialDayRows: Array<Record<string, any>> = hasItemFilter
    ? []
    : days
        .filter((d) => (d.is_urlaub ?? false) || (d.is_wetter ?? false))
        .map((d) => ({
          driver: excelValue(driverMap.get(d.user_id) ?? ""),
          ...makeRow({
            Datum: excelValue(d.date),
            Arbeitstag: "",
            Urlaub: excelValue(d.is_urlaub ?? false),
            Wetter: excelValue(d.is_wetter ?? false),
            Beginn: excelValue(d.arbeitsbeginn ?? ""),
            Ende: excelValue(d.arbeitsende ?? ""),
            Tageskommentar: excelValue(d.kommentar ?? ""),
          }),
        }));

  return itemRows.length === 0
    ? hasItemFilter
      ? []
      : specialDayRows
    : [...itemRows, ...specialDayRows];
}

function styleHeaderRow(worksheet: ExcelJS.Worksheet, columnCount: number) {
  const headerRow = worksheet.getRow(1);
  headerRow.height = 90;

  for (let c = 1; c <= columnCount; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      textRotation: 90,
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E2F3" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFBFBFBF" } },
      left: { style: "thin", color: { argb: "FFBFBFBF" } },
      bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
      right: { style: "thin", color: { argb: "FFBFBFBF" } },
    };
  }
}

function styleWeekendRow(row: ExcelJS.Row, columnCount: number) {
  for (let c = 1; c <= columnCount; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F2F2" },
    };
  }
}

function styleSumRow(row: ExcelJS.Row, columnCount: number) {
  for (let c = 1; c <= columnCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2F0D9" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF9E9E9E" } },
      left: { style: "thin", color: { argb: "FF9E9E9E" } },
      bottom: { style: "thin", color: { argb: "FF9E9E9E" } },
      right: { style: "thin", color: { argb: "FF9E9E9E" } },
    };
  }
}

function setColumnWidths(worksheet: ExcelJS.Worksheet, headers: string[]) {
  worksheet.columns = headers.map((h) => {
    if (h === "Datum") return { key: h, width: 10 };
    if (h === "Objekt") return { key: h, width: 24 };
    if (h === "Maschine") return { key: h, width: 14 };

    if (
      [
        "Fahrtzeit [min]",
        "MAS",
        "Unterhalt",
        "Reparatur",
        "Motormanuel",
        "Umsetzen",
        "Sonstiges",
        "Twinch",
        "Diesel",
        "Adblue",
        "MAS Start",
        "MAS Ende",
      ].includes(h)
    ) {
      return { key: h, width: 9 };
    }

    if (["Urlaub", "Wetter", "Arbeitstag"].includes(h)) {
      return { key: h, width: 8 };
    }

    if (["Beginn", "Ende"].includes(h)) {
      return { key: h, width: 9 };
    }

    if (h === "Beschreibung") return { key: h, width: 18 };
    if (h === "Tageskommentar" || h === "Einsatzkommentar") return { key: h, width: 18 };

    return { key: h, width: 16 };
  });
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function addSumRow(worksheet: ExcelJS.Worksheet) {
  const rows = worksheet.rowCount;
  if (rows < 2) return;

  const sumLabels = new Set([
    "Fahrtzeit [min]",
    "MAS",
    "Unterhalt",
    "Reparatur",
    "Motormanuel",
    "Umsetzen",
    "Sonstiges",
    "Twinch",
    "Diesel",
    "Adblue",
    "Arbeitstag",
  ]);

  const values: any[] = [];
  values[1] = "SUMME";

  for (let c = 2; c <= SHEET_HEADERS.length; c++) {
    const header = String(worksheet.getRow(1).getCell(c).value || "");
    if (sumLabels.has(header)) {
      const colLetter = worksheet.getColumn(c).letter;
      values[c] = { formula: `SUM(${colLetter}2:${colLetter}${rows})` };
    } else {
      values[c] = "";
    }
  }

  const row = worksheet.addRow(values);
  styleSumRow(row, SHEET_HEADERS.length);
}

async function exportToXLSX(filename: string, rows: Array<Record<string, any>>) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Export");

  const headers = ["driver", ...SHEET_HEADERS];

  setColumnWidths(worksheet, headers);
  worksheet.addRow(headers);
  styleHeaderRow(worksheet, headers.length);

  for (const r of rows) {
    const row = worksheet.addRow(headers.map((h) => r?.[h] ?? ""));
    const dateValue = String(r?.Datum ?? "");
    if (dateValue && isWeekendISO(dateValue)) {
      styleWeekendRow(row, headers.length);
    }
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  await downloadWorkbook(workbook, filename);
}

async function exportMonthlyDriverReportXLSX(
  filename: string,
  days: DayRow[],
  items: ItemRow[],
  drivers: DriverOption[],
  from: string,
  to: string
) {
  const workbook = new ExcelJS.Workbook();
  const allDates = listDatesInRange(from, to);

  const daysByDriverDate = new Map<string, DayRow>();
  for (const d of days) {
    daysByDriverDate.set(`${d.user_id}__${d.date}`, d);
  }

  const itemsByWorkday = new Map<string, ItemRow[]>();
  for (const it of items) {
    if (!itemsByWorkday.has(it.workday_id)) itemsByWorkday.set(it.workday_id, []);
    itemsByWorkday.get(it.workday_id)!.push(it);
  }

  const sortedDrivers = [...drivers].sort(sortByLastnameLabel);

  for (const drv of sortedDrivers) {
    const worksheet = workbook.addWorksheet(
      (drv.label || "Unbekannt").replace(/[\\\/\?\*\[\]\:]/g, "_").slice(0, 31) || "Unbekannt"
    );

    setColumnWidths(worksheet, [...SHEET_HEADERS]);
    worksheet.addRow([...SHEET_HEADERS]);
    styleHeaderRow(worksheet, SHEET_HEADERS.length);

    const workedDaySeen = new Set<string>();

    for (const date of allDates) {
      const day = daysByDriverDate.get(`${drv.id}__${date}`);

      if (!day) {
        const rowData = makeRow({
          Datum: date,
        });

        const row = worksheet.addRow(SHEET_HEADERS.map((h) => rowData[h] ?? ""));
        if (isWeekendISO(date)) {
          styleWeekendRow(row, SHEET_HEADERS.length);
        }
        continue;
      }

      const dayItems = itemsByWorkday.get(day.id) ?? [];

      if (dayItems.length === 0) {
        const rowData = makeRow({
          Datum: date,
          Arbeitstag: "",
          Urlaub: excelValue(day.is_urlaub ?? false),
          Wetter: excelValue(day.is_wetter ?? false),
          Beginn: excelValue(day.arbeitsbeginn ?? ""),
          Ende: excelValue(day.arbeitsende ?? ""),
          Tageskommentar: excelValue(day.kommentar ?? ""),
        });

        const row = worksheet.addRow(SHEET_HEADERS.map((h) => rowData[h] ?? ""));
        if (isWeekendISO(date)) {
          styleWeekendRow(row, SHEET_HEADERS.length);
        }
        continue;
      }

      for (const it of dayItems) {
        const dayKey = `${drv.id}__${date}`;
        const arbeitstag =
          hasWorkedDay(day, it) && !workedDaySeen.has(dayKey) ? 1 : "";

        if (arbeitstag === 1) {
          workedDaySeen.add(dayKey);
        }

        const rowData = makeRow({
          Datum: date,
          Objekt: excelValue(it.objekt ?? ""),
          Maschine: excelValue(it.maschine ?? ""),
          "Fahrtzeit [min]": excelValue(it.fahrtzeit_min ?? ""),
          MAS: excelValue(it.maschinenstunden_h ?? ""),
          Unterhalt: excelValue(it.unterhalt_h ?? ""),
          Reparatur: excelValue(it.reparatur_h ?? ""),
          Motormanuel: excelValue(it.motormanuel_h ?? ""),
          Umsetzen: excelValue(it.umsetzen_h ?? ""),
          Sonstiges: excelValue(it.sonstiges_h ?? ""),
          Beschreibung: excelValue(it.sonstiges_beschreibung ?? ""),
          Arbeitstag: arbeitstag,
          Urlaub: excelValue(day.is_urlaub ?? false),
          Wetter: excelValue(day.is_wetter ?? false),
          Twinch: excelValue(it.twinch_h ?? ""),
          Beginn: excelValue(day.arbeitsbeginn ?? ""),
          Ende: excelValue(day.arbeitsende ?? ""),
          "MAS Start": excelValue(it.mas_start ?? ""),
          "MAS Ende": excelValue(it.mas_end ?? ""),
          Diesel: excelValue(it.diesel_l ?? ""),
          Adblue: excelValue(it.adblue_l ?? ""),
          Tageskommentar: excelValue(day.kommentar ?? ""),
          Einsatzkommentar: excelValue(it.kommentar ?? ""),
        });

        const row = worksheet.addRow(SHEET_HEADERS.map((h) => rowData[h] ?? ""));
        if (isWeekendISO(date)) {
          styleWeekendRow(row, SHEET_HEADERS.length);
        }
      }
    }

    addSumRow(worksheet);

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: SHEET_HEADERS.length },
    };

    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  if (sortedDrivers.length === 0) {
    const worksheet = workbook.addWorksheet("Monatsbericht");
    setColumnWidths(worksheet, [...SHEET_HEADERS]);
    worksheet.addRow([...SHEET_HEADERS]);
    styleHeaderRow(worksheet, SHEET_HEADERS.length);
  }

  await downloadWorkbook(workbook, filename);
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
  const [drivers, setDrivers] = useState<DriverOption[]>([]);

  const [driverMap, setDriverMap] = useState<Map<string, string>>(new Map());

  const [selectedMachine, setSelectedMachine] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const needsRange = useMemo(
    () =>
      mode === "machine_range" ||
      mode === "driver_range" ||
      mode === "all_range" ||
      mode === "monthly_driver_tables",
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
      id: x.user_id,
      label: x.full_name?.trim() || x.username?.trim() || x.user_id,
    }));

    setDrivers([...drv].sort(sortByLastnameLabel));

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

    if (needsRange && (!from || !to)) {
      setMsg("Bitte Zeitraum (von/bis) setzen.");
      return;
    }
    if (needsMachine && !selectedMachine) {
      setMsg("Bitte Maschine wählen.");
      return;
    }
    if (needsDriver && !selectedDriver) {
      setMsg("Bitte Fahrer wählen.");
      return;
    }
    if (needsObject && !selectedObject) {
      setMsg("Bitte Objekt wählen.");
      return;
    }

    setLoading(true);
    setMsg("Export wird geladen...");

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

    let items: ItemRow[] = [];

    if (dayIds.length > 0) {
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

      items = ((itemData as any[]) ?? []) as ItemRow[];
    }

    if (needsMachine) {
      const m = selectedMachine.trim();
      items = items.filter((it) => (it.maschine ?? "").trim() === m);
    }

    if (needsObject) {
      const o = selectedObject.trim();
      items = items.filter((it) => (it.objekt ?? "").trim() === o);
    }

    if (mode === "monthly_driver_tables") {
      const filename = sanitizeFilename(`Monatsbericht_Fahrer_${from}_bis_${to}.xlsx`);
      await exportMonthlyDriverReportXLSX(filename, days, items, drivers, from, to);

      setLoading(false);
      setMsg("✅ Monatsbericht exportiert.");
      return;
    }

    if (dayIds.length === 0) {
      const filename = sanitizeFilename(`export_${mode}__leer.xlsx`);
      await exportToXLSX(filename, []);
      setLoading(false);
      setMsg("✅ Keine Daten im Filter. Leere XLSX exportiert.");
      return;
    }

    const hasItemFilter = needsMachine || needsObject;
    const finalRows = buildExportRows(days, items, driverMap, hasItemFilter);

    const labelParts: string[] = [mode];
    if (needsRange) labelParts.push(`${from}_bis_${to}`);
    if (needsMachine) labelParts.push(`maschine_${selectedMachine}`);
    if (needsDriver) {
      const label = drivers.find((x) => x.id === selectedDriver)?.label || selectedDriver;
      labelParts.push(`fahrer_${label}`);
    }
    if (needsObject) labelParts.push(`objekt_${selectedObject}`);

    const filename = sanitizeFilename(`export_${labelParts.join("__")}.xlsx`);
    await exportToXLSX(filename, finalRows);

    setLoading(false);
    setMsg(
      finalRows.length === 0
        ? "✅ Keine Daten im Filter. Leere XLSX exportiert."
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
            <option value="monthly_driver_tables">Monatsbericht · Fahrer-Tabellen</option>
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
          {loading ? "Lade..." : "XLSX exportieren"}
        </button>

        {msg && <p className="msg">{msg}</p>}
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
@media(max-width:700px){
  .row2{grid-template-columns:1fr}
  .head{flex-direction:column;align-items:stretch}
}
`;