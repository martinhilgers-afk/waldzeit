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
  hourly_wage: number | null;
  is_active: boolean | null;
};

type MachineRow = {
  name: string;
  hourly_rate: number | null;
  machine_type: string | null;
};

type ObjectRow = {
  name: string;
  status: "active" | "inactive" | "completed";
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
  hourly_wage: number | null;
};

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

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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
    result.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

function sortByLastnameLabel(a: DriverOption, b: DriverOption) {
  const getLastName = (label: string) => {
    const parts = String(label || "").trim().split(/\s+/).filter(Boolean);
    return parts.length === 0 ? "" : parts[parts.length - 1].toLowerCase();
  };

  const cmpLast = getLastName(a.label).localeCompare(getLastName(b.label), "de", { sensitivity: "base" });
  if (cmpLast !== 0) return cmpLast;

  return String(a.label || "").localeCompare(String(b.label || ""), "de", { sensitivity: "base" });
}

function isWeekendISO(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isoWeekShort(dateISO: string) {
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
  return `${String(week).padStart(2, "0")}/${String(isoYear).slice(-2)}`;
}

function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

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

function buildExportRows(days: DayRow[], items: ItemRow[], driverMap: Map<string, string>, hasItemFilter: boolean) {
  const dayMap = new Map<string, DayRow>(days.map((d) => [d.id, d]));
  const workedDaySeen = new Set<string>();

  const itemRows: Array<Record<string, any>> = items.map((it) => {
    const d = dayMap.get(it.workday_id);
    const drvName = d?.user_id ? driverMap.get(d.user_id) ?? "" : "";

    const dayKey = d ? `${d.user_id}__${d.date}` : "";
    const arbeitstag = dayKey && hasWorkedDay(d, it) && !workedDaySeen.has(dayKey) ? 1 : "";

    if (arbeitstag === 1) workedDaySeen.add(dayKey);

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

  return itemRows.length === 0 ? (hasItemFilter ? [] : specialDayRows) : [...itemRows, ...specialDayRows];
}

function styleHeaderRow(worksheet: ExcelJS.Worksheet, columnCount: number) {
  const headerRow = worksheet.getRow(1);
  headerRow.height = 90;

  for (let c = 1; c <= columnCount; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center", textRotation: 90, wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
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
    row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  }
}

function styleSumRow(row: ExcelJS.Row, columnCount: number) {
  for (let c = 1; c <= columnCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
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

    if (["Urlaub", "Wetter", "Arbeitstag"].includes(h)) return { key: h, width: 8 };
    if (["Beginn", "Ende"].includes(h)) return { key: h, width: 9 };
    if (h === "Beschreibung") return { key: h, width: 18 };
    if (h === "Tageskommentar" || h === "Einsatzkommentar") return { key: h, width: 18 };

    return { key: h, width: 16 };
  });
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function addSumRow(worksheet: ExcelJS.Worksheet, hourlyWage?: number | null) {
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

  const sumRow = worksheet.addRow(values);
  styleSumRow(sumRow, SHEET_HEADERS.length);

  const sumRowNr = sumRow.number;

  const rStunden = sumRowNr + 1;
  const rLohn = sumRowNr + 2;
  const rTage = sumRowNr + 3;
  const rUeErlaubt = sumRowNr + 6;
  const rFkErlaubt = sumRowNr + 7;
  const rUeReel = sumRowNr + 8;
  const rFkReel = sumRowNr + 9;
  const rUeZuViel = sumRowNr + 10;
  const rFkZusatz = sumRowNr + 12;
  const rFkResult1 = sumRowNr + 13;
  const rFkDiff = sumRowNr + 14;
  const rPraemie = sumRowNr + 16;

  const calcRows = [
    ["Stunden", { formula: `SUM(E${sumRowNr}:J${sumRowNr})` }],
    ["Lohn", hourlyWage ?? ""],
    ["TAGE Monat", { formula: `L${sumRowNr}` }],
    ["Überstunden MAX", { formula: `C${rTage}*1.6` }],
    ["Fahrtkosten MAX", { formula: `C${rTage}*29` }],
    ["Überstunden erlaubt", ""],
    ["Fahrtkosten erlaubt", ""],
    ["Überstunden reel", { formula: `C${rStunden}-(L${sumRowNr}*8)` }],
    ["Fahrtkosten reel", { formula: `D${sumRowNr}/60*C${rLohn}` }],
    ["Überstunden zu viel", { formula: `C${rUeReel}-C${rUeErlaubt}` }],
    ["Resultierende Überstunden", { formula: `C${rUeReel}-C${rUeZuViel}` }],
    ["Zusätzliche Fahrtkosten", { formula: `C${rUeZuViel}*C${rLohn}` }],
    ["Resultierende Fahrtkosten (1)", { formula: `C${rFkZusatz}+C${rFkReel}` }],
    ["Differenz zu max Fahrtkosten", { formula: `C${rFkResult1}-C${rFkErlaubt}` }],
    ["Resultierende Fahrtkosten", { formula: `IF(C${rFkDiff}<0,C${rFkResult1},C${rFkErlaubt})` }],
    ["Prämie", { formula: `IF(C${rFkDiff}>0,C${rFkDiff},0)` }],
    ["Prämie in Stunden gerechnet", { formula: `C${rPraemie}/C${rLohn}` }],
  ];

  for (const [label, value] of calcRows) {
    const row = worksheet.addRow([]);
    row.getCell(1).value = label;
    row.getCell(3).value = value as any;

    row.getCell(1).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    row.getCell(2).border = row.getCell(1).border;
    row.getCell(3).border = row.getCell(1).border;

    row.getCell(1).font = { bold: true };
    row.getCell(3).numFmt = "#,##0.0";

    if (label === "Lohn" || label === "Überstunden erlaubt" || label === "Fahrtkosten erlaubt") {
      row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
      row.getCell(3).font = { bold: true };
    }

    if (
      label === "Resultierende Überstunden" ||
      label === "Resultierende Fahrtkosten" ||
      label === "Prämie" ||
      label === "Prämie in Stunden gerechnet"
    ) {
      row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9DC3E6" } };
    }

    if (
      label === "Fahrtkosten MAX" ||
      label === "Fahrtkosten erlaubt" ||
      label === "Fahrtkosten reel" ||
      label === "Zusätzliche Fahrtkosten" ||
      label === "Resultierende Fahrtkosten" ||
      label === "Differenz zu max Fahrtkosten" ||
      label === "Prämie"
    ) {
      row.getCell(3).numFmt = '#,##0 "€"';
    }
  }

  worksheet.getColumn(1).width = Math.max(worksheet.getColumn(1).width || 10, 26);
  worksheet.getColumn(3).width = Math.max(worksheet.getColumn(3).width || 10, 14);
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
    if (dateValue && isWeekendISO(dateValue)) styleWeekendRow(row, headers.length);
  }

  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  await downloadWorkbook(workbook, filename);
}

function addHours(target: Map<string, Map<string, number>>, week: string, driverInitials: string, hours: number) {
  if (!hours || !Number.isFinite(hours)) return;
  if (!target.has(week)) target.set(week, new Map());
  const row = target.get(week)!;
  row.set(driverInitials, (row.get(driverInitials) ?? 0) + hours);
}

async function exportLotObjectXLSX(
  filename: string,
  selectedObject: string,
  days: DayRow[],
  items: ItemRow[],
  driverMap: Map<string, string>,
  machineRows: MachineRow[]
) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Los-Auswertung");

  const machineMap = new Map<string, MachineRow>();
  for (const m of machineRows) machineMap.set(m.name, m);

  const dayMap = new Map<string, DayRow>();
  for (const d of days) dayMap.set(d.id, d);

  const relevantItems = items.filter((it) => (it.objekt ?? "").trim() === selectedObject.trim());

  const usedHarvester = Array.from(
    new Set(
      relevantItems
        .filter((it) => machineMap.get(it.maschine ?? "")?.machine_type === "harvester")
        .map((it) => it.maschine ?? "")
        .filter(Boolean)
    )
  );

  const usedForwarder = Array.from(
    new Set(
      relevantItems
        .filter((it) => machineMap.get(it.maschine ?? "")?.machine_type === "forwarder")
        .map((it) => it.maschine ?? "")
        .filter(Boolean)
    )
  );

  const harvesterData = new Map<string, Map<string, Map<string, number>>>();
  const forwarderData = new Map<string, Map<string, Map<string, number>>>();
  const motormanuelData = new Map<string, Map<string, number>>();
  const sonstigesData = new Map<string, Map<string, number>>();
  const weeksSet = new Set<string>();

  for (const it of relevantItems) {
    const day = dayMap.get(it.workday_id);
    if (!day) continue;

    const week = isoWeekShort(day.date);
    weeksSet.add(week);

    const driverName = driverMap.get(day.user_id) ?? day.user_id;
    const ini = initials(driverName);

    const machineName = it.maschine ?? "";
    const machine = machineMap.get(machineName);
    const machineType = machine?.machine_type ?? "";

    if (machineType === "harvester") {
      if (!harvesterData.has(machineName)) harvesterData.set(machineName, new Map());
      addHours(harvesterData.get(machineName)!, week, ini, Number(it.maschinenstunden_h ?? 0));
    }

    if (machineType === "forwarder") {
      if (!forwarderData.has(machineName)) forwarderData.set(machineName, new Map());
      addHours(forwarderData.get(machineName)!, week, ini, Number(it.maschinenstunden_h ?? 0));
    }

    const motormanuelHours =
      Number(it.motormanuel_h ?? 0) +
      (machineName.trim().toLowerCase() === "motorsäge" ? Number(it.maschinenstunden_h ?? 0) : 0);

    addHours(motormanuelData, week, ini, motormanuelHours);
    addHours(sonstigesData, week, ini, Number(it.sonstiges_h ?? 0));
  }

  const weeks = Array.from(weeksSet).sort((a, b) => a.localeCompare(b));

  const blocks: Array<{ title: string; machineName?: string; data: Map<string, Map<string, number>>; rate: number | null }> = [];

  for (const name of usedHarvester) {
    blocks.push({
      title: "Harvester",
      machineName: name,
      data: harvesterData.get(name) ?? new Map(),
      rate: machineMap.get(name)?.hourly_rate ?? null,
    });
  }

  for (const name of usedForwarder) {
    blocks.push({
      title: "Forwarder",
      machineName: name,
      data: forwarderData.get(name) ?? new Map(),
      rate: machineMap.get(name)?.hourly_rate ?? null,
    });
  }

  blocks.push({
    title: "Motormanuel",
    machineName: "Motorsäge",
    data: motormanuelData,
    rate: machineMap.get("Motorsäge")?.hourly_rate ?? null,
  });

  blocks.push({
    title: "Sonstiges",
    machineName: "Sonstiges",
    data: sonstigesData,
    rate: null,
  });

  ws.getCell("A1").value = selectedObject;
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.getCell("A2").value = "KW";
  ws.getCell("A2").font = { bold: true };
  ws.getColumn(1).width = 12;

  let col = 2;

  for (const block of blocks) {
    ws.mergeCells(1, col, 1, col + 1);
    ws.getCell(1, col).value = block.title;
    ws.getCell(1, col).font = { bold: true };
    ws.getCell(1, col).alignment = { horizontal: "center" };

    ws.getCell(2, col).value = "Name";
    ws.getCell(2, col + 1).value = "Stunden";
    ws.getCell(2, col).font = { bold: true };
    ws.getCell(2, col + 1).font = { bold: true };

    ws.getColumn(col).width = 14;
    ws.getColumn(col + 1).width = 12;

    col += 2;
  }

  let rowNr = 3;

  for (const week of weeks) {
    ws.getCell(rowNr, 1).value = week;
    ws.getCell(rowNr, 1).font = { bold: true };

    col = 2;

    for (const block of blocks) {
      const driverMapForWeek = block.data.get(week) ?? new Map();
      const names = Array.from(driverMapForWeek.keys()).sort().join("+");
      const hours = Array.from(driverMapForWeek.values()).reduce((a, b) => a + b, 0);

      ws.getCell(rowNr, col).value = names;
      ws.getCell(rowNr, col + 1).value = hours || "";
      ws.getCell(rowNr, col + 1).numFmt = "#,##0.0";

      col += 2;
    }

    rowNr++;
  }

  const totalRow = Math.max(rowNr + 8, 16);
  ws.getCell(totalRow, 1).value = "TOTAL";
  ws.getCell(totalRow, 1).font = { bold: true };

  col = 2;

  for (const block of blocks) {
    const rate = block.rate ?? "";
    const hoursCol = ws.getColumn(col + 1).letter;

    ws.getCell(totalRow, col).value = rate === "" ? "" : `${rate} €`;
    ws.getCell(totalRow, col + 1).value = { formula: `SUM(${hoursCol}3:${hoursCol}${rowNr - 1})` };
    ws.getCell(totalRow, col + 1).numFmt = "#,##0.0";

    col += 2;
  }

  const lastCol = col - 1;

  for (let r = 1; r <= totalRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }

  for (let c = 1; c <= lastCol; c++) {
    ws.getCell(1, c).font = { bold: true };
    ws.getCell(2, c).font = { bold: true };
    ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
    ws.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
    ws.getCell(totalRow, c).font = { bold: true };
  }

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
  for (const d of days) daysByDriverDate.set(`${d.user_id}__${d.date}`, d);

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
        const rowData = makeRow({ Datum: date });
        const row = worksheet.addRow(SHEET_HEADERS.map((h) => rowData[h] ?? ""));
        if (isWeekendISO(date)) styleWeekendRow(row, SHEET_HEADERS.length);
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
        if (isWeekendISO(date)) styleWeekendRow(row, SHEET_HEADERS.length);
        continue;
      }

      for (const it of dayItems) {
        const dayKey = `${drv.id}__${date}`;
        const arbeitstag = hasWorkedDay(day, it) && !workedDaySeen.has(dayKey) ? 1 : "";

        if (arbeitstag === 1) workedDaySeen.add(dayKey);

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
        if (isWeekendISO(date)) styleWeekendRow(row, SHEET_HEADERS.length);
      }
    }

    addSumRow(worksheet, drv.hourly_wage);

    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: SHEET_HEADERS.length } };
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
  const [machineRows, setMachineRows] = useState<MachineRow[]>([]);
  const [objects, setObjects] = useState<string[]>([]);
  const [completedObjectNames, setCompletedObjectNames] = useState<Set<string>>(new Set());
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverMap, setDriverMap] = useState<Map<string, string>>(new Map());

  const [selectedMachine, setSelectedMachine] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const needsRange = useMemo(
    () => mode === "machine_range" || mode === "driver_range" || mode === "all_range" || mode === "monthly_driver_tables",
    [mode]
  );

  const needsMachine = useMemo(() => mode === "machine_range" || mode === "machine_object", [mode]);
  const needsDriver = useMemo(() => mode === "driver_range" || mode === "driver_object", [mode]);
  const needsObject = useMemo(() => mode === "machine_object" || mode === "driver_object" || mode === "all_object", [mode]);

  useEffect(() => {
    if (selectedObject && completedObjectNames.has(selectedObject.trim())) {
      setSelectedObject("");
    }
  }, [completedObjectNames, selectedObject]);

  async function loadSelectors() {
    const [m, o, d] = await Promise.all([
      supabase.from("machines").select("name,hourly_rate,machine_type").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("objects").select("name,status").order("name", { ascending: true }),
      supabase
        .from("driver_profiles")
        .select("user_id,username,full_name,hourly_wage,is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
    ]);

    const machineData = (((m.data as any[]) ?? []) as MachineRow[]);
    setMachineRows(machineData);
    setMachines(machineData.map((x) => x.name));

    const objectRows = (((o.data as any[]) ?? []) as ObjectRow[]);

    // Im Export bleiben aktive und deaktivierte Lose sichtbar.
    // Abgeschlossene Lose werden weder angeboten noch exportiert.
    const visibleObjects = objectRows
      .filter((x) => x.status !== "completed")
      .map((x) => String(x.name || "").trim())
      .filter(Boolean);

    const completedNames = new Set(
      objectRows
        .filter((x) => x.status === "completed")
        .map((x) => String(x.name || "").trim())
        .filter(Boolean)
    );

    setObjects(visibleObjects);
    setCompletedObjectNames(completedNames);

    const drvRows = (((d.data as any[]) ?? []) as DriverRow[]).filter((x) => x.user_id);

    const drv = drvRows.map((x) => ({
      id: x.user_id,
      label: x.full_name?.trim() || x.username?.trim() || x.user_id,
      hourly_wage: x.hourly_wage ?? null,
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

      if (ok) await loadSelectors();
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

    // Status der Lose unmittelbar vor jedem Export neu laden.
    // So kann auch ein zwischenzeitlich abgeschlossenes Los niemals
    // in einer normalen Auswertung oder in der Los-Auswertung erscheinen.
    const { data: currentObjectData, error: currentObjectError } = await supabase
      .from("objects")
      .select("name,status");

    if (currentObjectError) {
      setLoading(false);
      setMsg("Fehler Objektstatus laden: " + currentObjectError.message);
      return;
    }

    const currentObjectRows = (((currentObjectData as any[]) ?? []) as ObjectRow[]);
    const currentCompletedObjectNames = new Set(
      currentObjectRows
        .filter((x) => x.status === "completed")
        .map((x) => String(x.name || "").trim())
        .filter(Boolean)
    );

    setCompletedObjectNames(currentCompletedObjectNames);

    if (selectedObject && currentCompletedObjectNames.has(selectedObject.trim())) {
      setSelectedObject("");
      setLoading(false);
      setMsg("Dieses Los wurde inzwischen abgeschlossen und kann nicht mehr exportiert werden.");
      await loadSelectors();
      return;
    }

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

    // Zentrale Exportregel:
    // - active: sichtbar
    // - inactive: sichtbar
    // - completed: vollständig aus allen Exporten entfernen
    //
    // Einträge ohne Objektname oder mit einem historischen Namen, der nicht mehr
    // in der Objekttabelle existiert, bleiben erhalten. Ausgeblendet werden nur
    // Lose, die ausdrücklich den Status "completed" besitzen.
    items = items.filter((it) => {
      const objectName = String(it.objekt || "").trim();
      return !objectName || !currentCompletedObjectNames.has(objectName);
    });

    if (needsMachine) {
      const m = selectedMachine.trim();
      items = items.filter((it) => (it.maschine ?? "").trim() === m);
    }

    if (needsObject) {
      const o = selectedObject.trim();
      items = items.filter((it) => (it.objekt ?? "").trim() === o);
    }

    if (mode === "all_object") {
      const filename = sanitizeFilename(`Los-Auswertung_${selectedObject}.xlsx`);
      await exportLotObjectXLSX(filename, selectedObject, days, items, driverMap, machineRows);

      setLoading(false);
      setMsg("✅ Los-Auswertung exportiert.");
      return;
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
    setMsg(finalRows.length === 0 ? "✅ Keine Daten im Filter. Leere XLSX exportiert." : `✅ Export fertig: ${finalRows.length} Zeilen`);
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
            <button style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", background: "#fff", fontWeight: 800 }}>Zurück</button>
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
            <option value="all_object">Alles · Objekt / Los-Auswertung</option>
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