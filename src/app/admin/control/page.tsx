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
  status?: "active" | "inactive" | "completed" | null;
  serial_number?: string | null;
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
  is_feiertag: boolean | null;
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
  is_checked: boolean | null;
};

type ControlDay = DayRow & {
  driverName: string;
  items: ItemRow[];
};

type DisplayDay = { date: string; day: ControlDay | null; komatsu: KomatsuRow[]; machineKomatsu: KomatsuRow[] };

type DriverWeekGroup = {
  driver: DriverRow;
  driverName: string;
  days: DisplayDay[];
};

type WeekGroup = {
  key: string;
  drivers: DriverWeekGroup[];
};

type DayFlags = {
  is_urlaub: boolean;
  is_wetter: boolean;