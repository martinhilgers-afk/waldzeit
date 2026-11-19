"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type WorkItem = {
  key: string;
  objekt: string;
  maschine: string;
  fahrtzeit_min: string;
  mas_start: string;
  mas_end: string;
  maschinenstunden_h: string;
  last_mas_end: number | null;
  unterhalt_h: string;
  reparatur_h: string;
  motormanuel_h: string;
  umsetzen_h: string;
  sonstiges_h: string;
  sonstiges_beschreibung: string;
  diesel_l: string;
  adblue_l: string;
  kommentar: string;
  twinch_used: boolean;
  twinch_h: string;
  warnung: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function round1(v: number | null | undefined) {
  if (v === null || v === undefined) return null;
  return Math.round(v * 10) / 10;
}

function toNumOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return round1(n);
}

function toIntOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function isMotorsaege(maschine: string) {
  const m = (maschine || "").trim().toLowerCase();
  return m === "motorsäge" || m === "motorsaege";
}

type TimeSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

function TimeSelect({ label, value, onChange, disabled }: TimeSelectProps) {
  const [hour = "", minute = ""] = value.split(":");
  const setPart = (h: string, m: string) => {
    if (!h && !m) {
      onChange("");
      return;
    }
    onChange(`${h || "00"}:${m || "00"}`);
  };

  return (
    <div className="timeSelect">
      <select
        aria-label={`${label} Stunde`}
        value={hour}
        disabled={disabled}
        onChange={(e) => setPart(e.target.value, minute)}
        className="control"
      >
        <option value="">Std.</option>