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
    <div className="workdayTimeSelect">
      <select
        aria-label={`${label} Stunde`}
        value={hour}
        disabled={disabled}
        onChange={(e) => setPart(e.target.value, minute)}
        className="control"
      >
        <option value="">Std.</option>
        {Array.from({ length: 24 }, (_, i) => {
          const h = String(i).padStart(2, "0");
          return <option key={h} value={h}>{h}</option>;
        })}
      </select>
      <span className="timeColon">:</span>
      <select
        aria-label={`${label} Minute`}
        value={minute}
        disabled={disabled}
        onChange={(e) => setPart(hour, e.target.value)}
        className="control"
      >
        <option value="">Min.</option>
        {Array.from({ length: 60 }, (_, i) => {
          const m = String(i).padStart(2, "0");
          return <option key={m} value={m}>{m}</option>;
        })}
      </select>
    </div>
  );
}

export default function NewWorkday() {
  const [userId, setUserId] = useState<string | null>(null);
  const [meName, setMeName] = useState<string>("");
  const [defaultMachine, setDefaultMachine] = useState<string>("");

  const [date, setDate] = useState(todayISO());
  const [arbeitsbeginn, setArbeitsbeginn] = useState("");
  const [arbeitsende, setArbeitsende] = useState("");
  const [tagesKommentar, setTagesKommentar] = useState("");

  const [isUrlaub, setIsUrlaub] = useState(false);
  const [isWetter, setIsWetter] = useState(false);
  const [isFeiertag, setIsFeiertag] = useState(false);

  const isSpecialDay = isUrlaub || isWetter || isFeiertag;

  const [objectOptions, setObjectOptions] = useState<string[]>([]);
  const [machineOptions, setMachineOptions] = useState<string[]>([]);

  const [items, setItems] = useState<WorkItem[]>(() => [
    {
      key: uid(),
      objekt: "",
      maschine: "",
      fahrtzeit_min: "",
      mas_start: "",
      mas_end: "",
      maschinenstunden_h: "",
      last_mas_end: null,
      unterhalt_h: "",
      reparatur_h: "",
      motormanuel_h: "",
      umsetzen_h: "",
      sonstiges_h: "",
      sonstiges_beschreibung: "",
      diesel_l: "",
      adblue_l: "",
      kommentar: "",
      twinch_used: false,
      twinch_h: "",
      warnung: "",
    },
  ]);

  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }

      setMeName(me.firstName);
      setUserId(me.id);
      setDefaultMachine(String((me as any).default_machine || ""));

      const [o, m] = await Promise.all([
        supabase.from("objects").select("name").eq("status", "active").order("name", { ascending: true }),
        supabase.from("machines").select("name").eq("is_active", true).order("name", { ascending: true }),
      ]);

      const activeObjects = ((o.data as any[]) ?? []).map((x) => String(x.name || "").trim()).filter(Boolean);
      setObjectOptions(activeObjects);
      setMachineOptions(((m.data as any[]) ?? []).map((x) => x.name));

      // Ein eventuell gespeichertes Los darf nur vorausgewählt bleiben,
      // wenn es weiterhin den Status "active" hat.
      setItems((prev) =>
        prev.map((it) => {
          if (!it.objekt.trim()) return it;
          return activeObjects.includes(it.objekt.trim()) ? it : { ...it, objekt: "" };
        })
      );
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const lsKey = `waldzeit:last_objekt:${userId}`;
    const cached = typeof window !== "undefined" ? localStorage.getItem(lsKey) : null;

    if (cached && cached.trim() && objectOptions.includes(cached.trim())) {
      setItems((prev) =>
        prev.map((it, idx) => {
          if (idx !== 0) return it;
          if (it.objekt.trim()) return it;
          return { ...it, objekt: cached.trim() };
        })
      );
    }

    (async () => {
      const { data: days, error: dayErr } = await supabase
        .from("workdays")
        .select("id,date")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(60);

      if (dayErr || !days || days.length === 0) return;

      const ids = (days as any[]).map((d) => d.id);

      const { data: last, error: itemErr } = await supabase
        .from("work_items")
        .select("objekt, created_at")
        .in("workday_id", ids)
        .not("objekt", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (itemErr || !last || last.length === 0) return;

      const lastObj = String((last as any[])[0]?.objekt || "").trim();
      if (!lastObj || !objectOptions.includes(lastObj)) return;

      try {
        localStorage.setItem(lsKey, lastObj);
      } catch {}

      setItems((prev) =>
        prev.map((it, idx) => {
          if (idx !== 0) return it;
          if (it.objekt.trim()) return it;
          return { ...it, objekt: lastObj };
        })
      );
    })();
  }, [userId, objectOptions]);

  useEffect(() => {
    const dm = defaultMachine.trim();
    if (!dm) return;

    const firstItemKey = items[0]?.key;
    if (!firstItemKey) return;

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== 0) return it;
        if (it.maschine.trim()) return it;

        return {
          ...it,
          maschine: dm,
          warnung: "",
          last_mas_end: null,
          mas_start: "",
          mas_end: "",
          maschinenstunden_h: "",
          twinch_h: "",
        };
      })
    );

    void suggestMasStart(dm, firstItemKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMachine]);

  useEffect(() => {
    if (isSpecialDay) {
      setArbeitsbeginn("");
      setArbeitsende("");
    }
  }, [isSpecialDay]);

  function updateItem(key: string, patch: Partial<WorkItem>) {
    setItems((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        key: uid(),
        objekt: "",
        maschine: defaultMachine.trim() || "",
        fahrtzeit_min: "",
        mas_start: "",
        mas_end: "",
        maschinenstunden_h: "",
        last_mas_end: null,
        unterhalt_h: "",
        reparatur_h: "",
        motormanuel_h: "",
        umsetzen_h: "",
        sonstiges_h: "",
        sonstiges_beschreibung: "",
        diesel_l: "",
        adblue_l: "",
        kommentar: "",
        twinch_used: false,
        twinch_h: "",
        warnung: "",
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.key !== key)));
  }

  function setSpecial(type: "urlaub" | "wetter" | "feiertag", checked: boolean) {
    if (type === "urlaub") {
      setIsUrlaub(checked);
      if (checked) {
        setIsWetter(false);
        setIsFeiertag(false);
      }
    }

    if (type === "wetter") {
      setIsWetter(checked);
      if (checked) {
        setIsUrlaub(false);
        setIsFeiertag(false);
      }
    }

    if (type === "feiertag") {
      setIsFeiertag(checked);
      if (checked) {
        setIsUrlaub(false);
        setIsWetter(false);
      }
    }
  }

  async function suggestFahrtzeit(objektValue: string, itemKey: string) {
    if (!userId) return;
    const obj = objektValue.trim();
    if (obj.length < 2) return;

    const { data: days, error: dayErr } = await supabase
      .from("workdays")
      .select("id,date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60);

    if (dayErr || !days || days.length === 0) return;

    const ids = (days as any[]).map((d) => d.id);

    const { data: last, error: itemErr } = await supabase
      .from("work_items")
      .select("fahrtzeit_min, created_at")
      .eq("objekt", obj)
      .in("workday_id", ids)
      .not("fahrtzeit_min", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (itemErr || !last || last.length === 0) return;

    const v = (last as any[])[0]?.fahrtzeit_min;
    if (typeof v === "number") {
      setItems((prev) =>
        prev.map((it) => {
          if (it.key !== itemKey) return it;
          if (it.fahrtzeit_min.trim()) return it;
          return { ...it, fahrtzeit_min: String(v) };
        })
      );
    }
  }

  async function suggestMasStart(maschineValue: string, itemKey: string) {
    const m = maschineValue.trim();
    if (!m) return;

    if (isMotorsaege(m)) {
      updateItem(itemKey, { last_mas_end: null });
      return;
    }

    const { data, error } = await supabase
      .from("work_items")
      .select("mas_end, created_at")
      .eq("maschine", m)
      .not("mas_end", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      updateItem(itemKey, {
        last_mas_end: null,
        mas_start: "",
        mas_end: "",
        maschinenstunden_h: "",
        twinch_h: "",
        warnung: "",
      });
      return;
    }

    const lastEnd = (data as any[])[0]?.mas_end;
    const lastEndNum = typeof lastEnd === "number" ? lastEnd : Number(lastEnd);

    if (!Number.isFinite(lastEndNum)) {
      updateItem(itemKey, {
        last_mas_end: null,
        mas_start: "",
        mas_end: "",
        maschinenstunden_h: "",
        twinch_h: "",
        warnung: "",
      });
      return;
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;

        return {
          ...it,
          last_mas_end: lastEndNum,
          mas_start: String(lastEndNum).replace(".", ","),
          mas_end: "",
          maschinenstunden_h: "",
          twinch_h: "",
          warnung: "",
        };
      })
    );
  }

  function calcMasHours(it: WorkItem) {
    const s = toNumOrNull(it.mas_start);
    const e = toNumOrNull(it.mas_end);
    if (s === null || e === null) return null;
    return round1(e - s);
  }

  async function checkMachineHoursForDay(itemKey: string, it: WorkItem) {
    if (isSpecialDay || isMotorsaege(it.maschine)) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    const m = it.maschine.trim();
    if (!m || !date) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    const s = toNumOrNull(it.mas_start);
    const e = toNumOrNull(it.mas_end);

    if (s !== null && it.last_mas_end !== null && s < it.last_mas_end) {
      updateItem(itemKey, {
        warnung: `⚠️ Warnung: MAS Beginn (${s}) ist kleiner als zuletzt gespeichert (${it.last_mas_end}). Bitte prüfen.`,
      });
      return;
    }

    if (s === null || e === null) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    if (e < s) {
      updateItem(itemKey, { warnung: "❌ Block: MAS Ende ist kleiner als MAS Beginn." });
      return;
    }

    const deltaHours = round1(e - s) ?? 0;

    const { data, error } = await supabase.rpc("machine_hours_total", {
      p_date: date,
      p_maschine: m,
    });

    if (error) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    const total = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(total)) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    const sum = round1(total + deltaHours) ?? 0;

    if (sum > 24) {
      updateItem(itemKey, { warnung: `❌ Block: Maschine wäre am ${date} insgesamt ca. ${sum.toFixed(1)}h (>24h)` });
      return;
    }

    if (sum > 16) {
      updateItem(itemKey, { warnung: `⚠️ Hinweis: Maschine kommt am ${date} auf ca. ${sum.toFixed(1)}h` });
      return;
    }

    updateItem(itemKey, { warnung: "" });
  }

  const validationErrors = useMemo(() => {
    const errs: string[] = [];

    if (!date) errs.push("Datum fehlt.");

    if (!isSpecialDay) {
      if ((arbeitsbeginn && !arbeitsende) || (!arbeitsbeginn && arbeitsende)) {
        errs.push("Arbeitsbeginn und Arbeitsende bitte beide setzen (oder beide leer lassen).");
      }

      items.forEach((it, idx) => {
        const n = idx + 1;
        if (!it.objekt.trim()) {
          errs.push(`Einsatz ${n}: Objekt fehlt.`);
        } else if (!objectOptions.includes(it.objekt.trim())) {
          errs.push(`Einsatz ${n}: Das gewählte Los ist nicht mehr aktiv und kann nicht gespeichert werden.`);
        }

        if (!it.maschine.trim()) errs.push(`Einsatz ${n}: Maschine fehlt.`);

        const sonstH = toNumOrNull(it.sonstiges_h) ?? 0;
        if (sonstH > 0 && !it.sonstiges_beschreibung.trim()) {
          errs.push(`Einsatz ${n}: Bei Sonstiges > 0 ist eine Beschreibung Pflicht.`);
        }

        if (!isMotorsaege(it.maschine)) {
          const s = toNumOrNull(it.mas_start);
          const e = toNumOrNull(it.mas_end);
          const anyMas = it.mas_start.trim() !== "" || it.mas_end.trim() !== "";

          if (anyMas && (s === null || e === null)) {
            errs.push(`Einsatz ${n}: MAS Beginn und MAS Ende bitte beide ausfüllen.`);
          }

          if (s !== null && e !== null && e < s) {
            errs.push(`Einsatz ${n}: MAS Ende darf nicht kleiner als MAS Beginn sein.`);
          }

          if (it.warnung.includes("❌ Block")) {
            errs.push(`Einsatz ${n}: Maschinenstunden-Check blockiert.`);
          }
        }

        if (it.twinch_used) {
          const th = toNumOrNull(it.twinch_h);
          if (it.twinch_h.trim() !== "" && th === null) errs.push(`Einsatz ${n}: Twinch Stunden sind keine Zahl.`);
        }
      });
    }

    return errs;
  }, [date, arbeitsbeginn, arbeitsende, items, isSpecialDay, objectOptions]);

  async function save() {
    if (!userId) return;

    setMsg("");

    if (validationErrors.length > 0) {
      setMsg("Bitte korrigieren:\n- " + validationErrors.join("\n- "));
      return;
    }

    setSaving(true);
    setMsg("Speichern...");

    const { data: dayRows, error: dayErr } = await supabase
      .from("workdays")
      .upsert(
        {
          user_id: userId,
          date,
          arbeitsbeginn: isSpecialDay ? null : arbeitsbeginn || null,
          arbeitsende: isSpecialDay ? null : arbeitsende || null,
          kommentar: tagesKommentar.trim() || null,
          is_urlaub: isUrlaub,
          is_wetter: isWetter,
          is_feiertag: isFeiertag,
        },
        { onConflict: "user_id,date" }
      )
      .select("id")
      .limit(1);

    if (dayErr) {
      setSaving(false);
      setMsg("Fehler Workday: " + dayErr.message);
      return;
    }

    const workdayId = (dayRows as any[])?.[0]?.id as string | undefined;

    if (!workdayId) {
      setSaving(false);
      setMsg("Fehler: Workday-ID fehlt.");
      return;
    }

    const { error: delErr } = await supabase.from("work_items").delete().eq("workday_id", workdayId);

    if (delErr) {
      setSaving(false);
      setMsg("Fehler beim Löschen alter Einsätze: " + delErr.message);
      return;
    }

    if (isSpecialDay) {
      setSaving(false);
      setMsg("✅ Gespeichert!");
      setTimeout(() => {
        location.href = "/app";
      }, 350);
      return;
    }

    const payload = items.map((it) => {
      const chainsaw = isMotorsaege(it.maschine);
      const s = chainsaw ? null : toNumOrNull(it.mas_start);
      const e = chainsaw ? null : toNumOrNull(it.mas_end);
      const delta = s !== null && e !== null ? round1(e - s) : null;

      return {
        workday_id: workdayId,
        objekt: it.objekt.trim(),
        maschine: it.maschine.trim(),
        fahrtzeit_min: toIntOrNull(it.fahrtzeit_min),
        mas_start: s,
        mas_end: e,
        maschinenstunden_h: delta !== null && Number.isFinite(delta) ? delta : null,
        unterhalt_h: toNumOrNull(it.unterhalt_h),
        reparatur_h: toNumOrNull(it.reparatur_h),
        motormanuel_h: toNumOrNull(it.motormanuel_h),
        umsetzen_h: toNumOrNull(it.umsetzen_h),
        sonstiges_h: toNumOrNull(it.sonstiges_h),
        sonstiges_beschreibung: it.sonstiges_beschreibung.trim() || null,
        diesel_l: toNumOrNull(it.diesel_l),
        adblue_l: toNumOrNull(it.adblue_l),
        kommentar: it.kommentar.trim() || null,
        twinch_used: !!it.twinch_used,
        twinch_h: it.twinch_used ? toNumOrNull(it.twinch_h) : null,
      };
    });

    const { error: insErr } = await supabase.from("work_items").insert(payload);
    setSaving(false);

    if (insErr) {
      setMsg("Fehler beim Speichern der Einsätze: " + insErr.message);
      return;
    }

    setMsg("✅ Gespeichert!");
    setTimeout(() => {
      location.href = "/app";
    }, 350);
  }

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1 className="h1">Neuer Tag</h1>
          <div className="sub">
            Angemeldet als: <b>{meName || "…"}</b>{" "}
            <Link href="/profile" className="link">
              Profil
            </Link>
          </div>
        </div>

        <Link href="/app" className="btn">Zur Übersicht
        </Link>
      </header>

      <section className="card">
        <h2 className="h2">Tag</h2>

        <label htmlFor="workday-date" className="lbl">Datum</label>

        <div className="dateBox">
          <div className="dateInner">
            <input id="workday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="control" />
            <div className="row2">
              <button type="button" onClick={() => setDate(todayISO())} className="btnWide">
                Heute
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  setDate(`${y}-${m}-${day}`);
                }}
                className="btnWide"
              >
                Gestern
              </button>
            </div>
          </div>
        </div>

        <div className="row3" style={{ marginTop: 12 }}>
          <label className="chk">
            <input type="checkbox" checked={isUrlaub} onChange={(e) => setSpecial("urlaub", e.target.checked)} />
            Urlaub
          </label>

          <label className="chk">
            <input type="checkbox" checked={isWetter} onChange={(e) => setSpecial("wetter", e.target.checked)} />
            Wetter
          </label>

          <label className="chk">
            <input type="checkbox" checked={isFeiertag} onChange={(e) => setSpecial("feiertag", e.target.checked)} />
            Feiertag
          </label>
        </div>

        <div className="row2" style={{ marginTop: 12, opacity: isSpecialDay ? 0.55 : 1 }}>
          <label className="field">
            Arbeitsbeginn
            <div className="rowBtn">
              <TimeSelect label="Arbeitsbeginn" value={arbeitsbeginn} disabled={isSpecialDay} onChange={setArbeitsbeginn} />
              <button type="button" disabled={isSpecialDay} onClick={() => setArbeitsbeginn(nowHHMM())} className="btnSm">
                Jetzt
              </button>
            </div>
          </label>

          <label className="field">
            Arbeitsende
            <div className="rowBtn">
              <TimeSelect label="Arbeitsende" value={arbeitsende} disabled={isSpecialDay} onChange={setArbeitsende} />
              <button type="button" disabled={isSpecialDay} onClick={() => setArbeitsende(nowHHMM())} className="btnSm">
                Jetzt
              </button>
            </div>
          </label>
        </div>

        <label className="field" style={{ marginTop: 12 }}>
          Tages-Kommentar
          <textarea value={tagesKommentar} onChange={(e) => setTagesKommentar(e.target.value)} className="control" style={{ minHeight: 90 }} />
        </label>

        {isSpecialDay && (
          <div className="hint">
            {isUrlaub
              ? "📌 Urlaub: Es werden keine Einsätze gespeichert."
              : isWetter
                ? "🌧️ Wetter: Tag zählt als Arbeitstag, aber ohne geleistete Stunden."
                : "🎉 Feiertag: Es werden keine Einsätze gespeichert."}
          </div>
        )}
      </section>

      {!isSpecialDay && (
        <section className="assignments">
          <div className="head2">
            <h2 className="h2" style={{ margin: 0 }}>
              Einsätze
            </h2>
            <button onClick={addItem} className="btn">
              + Einsatz hinzufügen
            </button>
          </div>

          <div className="grid">
            {items.map((it, idx) => {
              const chainsaw = isMotorsaege(it.maschine);

              return (
                <details key={it.key} open={idx === 0} className="card">
                  <summary className="sum">
                    Einsatz {idx + 1}: {it.objekt || "Objekt"} / {it.maschine || "Maschine"}
                  </summary>

                  <div className="inner">
                    <label className="field">
                      Objekt *
                      <select
                        value={it.objekt}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateItem(it.key, { objekt: v });

                          if (userId) {
                            try {
                              localStorage.setItem(`waldzeit:last_objekt:${userId}`, v);
                            } catch {}
                          }

                          if (v.trim().length >= 2) suggestFahrtzeit(v, it.key);
                        }}
                        className="control"
                      >
                        <option value="">Bitte wählen…</option>
                        {objectOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      Maschine *
                      <select
                        value={it.maschine}
                        onChange={async (e) => {
                          const v = e.target.value;

                          if (isMotorsaege(v)) {
                            updateItem(it.key, {
                              maschine: v,
                              warnung: "",
                              last_mas_end: null,
                              mas_start: "",
                              mas_end: "",
                              maschinenstunden_h: "",
                            });
                            return;
                          }

                          updateItem(it.key, {
                            maschine: v,
                            warnung: "",
                            last_mas_end: null,
                            mas_start: "",
                            mas_end: "",
                            maschinenstunden_h: "",
                            twinch_h: "",
                          });

                          if (v) await suggestMasStart(v, it.key);
                        }}
                        className="control"
                      >
                        <option value="">Bitte wählen…</option>
                        {machineOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="row2">
                      <label className="field">
                        Fahrtzeit (Min.)
                        <input value={it.fahrtzeit_min} onChange={(e) => updateItem(it.key, { fahrtzeit_min: e.target.value })} inputMode="numeric" className="control" />
                      </label>

                      <label className="field">
                        MAS Stunden (h) automatisch
                        <input value={it.maschinenstunden_h} readOnly placeholder={chainsaw ? "(Motorsäge: keine MAS)" : "(aus MAS Beginn/Ende)"} className="control ro" />
                      </label>
                    </div>

                    {!chainsaw ? (
                      <div className="row2">
                        <label className="field">
                          MAS Beginn
                          <input
                            value={it.mas_start}
                            onChange={(e) => {
                              const v = e.target.value;
                              const next = { ...it, mas_start: v };
                              const delta = calcMasHours(next);
                              const deltaText = delta === null ? "" : String(delta).replace(".", ",");

                              updateItem(it.key, {
                                mas_start: v,
                                maschinenstunden_h: deltaText,
                                twinch_h: it.twinch_used ? deltaText : it.twinch_h,
                              });

                              checkMachineHoursForDay(it.key, next);
                            }}
                            inputMode="decimal"
                            placeholder="z.B. 2450,5"
                            className="control"
                          />
                        </label>

                        <label className="field">
                          MAS Ende
                          <input
                            value={it.mas_end}
                            onChange={(e) => {
                              const v = e.target.value;
                              const next = { ...it, mas_end: v };
                              const delta = calcMasHours(next);
                              const deltaText = delta === null ? "" : String(delta).replace(".", ",");

                              updateItem(it.key, {
                                mas_end: v,
                                maschinenstunden_h: deltaText,
                                twinch_h: it.twinch_used ? deltaText : it.twinch_h,
                              });

                              checkMachineHoursForDay(it.key, next);
                            }}
                            inputMode="decimal"
                            placeholder="z.B. 2456,0"
                            className="control"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="row2">
                        <label className="field">
                          Motormanuel (h)
                          <input value={it.motormanuel_h} onChange={(e) => updateItem(it.key, { motormanuel_h: e.target.value })} inputMode="decimal" placeholder="z.B. 2,0" className="control" />
                        </label>

                        <div className="field">
                          <div style={{ marginTop: 6, opacity: 0.75, fontWeight: 800 }}>Hinweis</div>
                          <div style={{ marginTop: 8, opacity: 0.8 }}>Motorsäge: keine Maschinenstunden (MAS). Bitte Motormanuel hier eintragen.</div>
                        </div>
                      </div>
                    )}

                    {!chainsaw && it.warnung && <div className={it.warnung.includes("❌") ? "warn bad" : "warn"}>{it.warnung}</div>}

                    <details className="subCard">
                      <summary className="sum2">Tätigkeiten / Diesel / Details</summary>

                      <div className="inner">
                        <div className="row2">
                          <label className="field">
                            Unterhalt (h)
                            <input value={it.unterhalt_h} onChange={(e) => updateItem(it.key, { unterhalt_h: e.target.value })} inputMode="decimal" className="control" />
                          </label>
                          <label className="field">
                            Reparatur (h)
                            <input value={it.reparatur_h} onChange={(e) => updateItem(it.key, { reparatur_h: e.target.value })} inputMode="decimal" className="control" />
                          </label>
                        </div>

                        <div className="row2">
                          {!chainsaw ? (
                            <label className="field">
                              Motormanuel (h)
                              <input value={it.motormanuel_h} onChange={(e) => updateItem(it.key, { motormanuel_h: e.target.value })} inputMode="decimal" className="control" />
                            </label>
                          ) : (
                            <div />
                          )}

                          <label className="field">
                            Umsetzen (h)
                            <input value={it.umsetzen_h} onChange={(e) => updateItem(it.key, { umsetzen_h: e.target.value })} inputMode="decimal" className="control" />
                          </label>
                        </div>

                        <div className="row2">
                          <label className="field">
                            Sonstiges (h)
                            <input value={it.sonstiges_h} onChange={(e) => updateItem(it.key, { sonstiges_h: e.target.value })} inputMode="decimal" className="control" />
                          </label>
                          <label className="field">
                            Sonstiges Beschreibung
                            <input value={it.sonstiges_beschreibung} onChange={(e) => updateItem(it.key, { sonstiges_beschreibung: e.target.value })} placeholder="z.B. Kette wechseln" className="control" />
                          </label>
                        </div>

                        <div className="row2">
                          <label className="field">
                            Diesel (L)
                            <input value={it.diesel_l} onChange={(e) => updateItem(it.key, { diesel_l: e.target.value })} inputMode="decimal" className="control" />
                          </label>
                          <label className="field">
                            AdBlue (L)
                            <input value={it.adblue_l} onChange={(e) => updateItem(it.key, { adblue_l: e.target.value })} inputMode="decimal" className="control" />
                          </label>
                        </div>

                        <div className="row2">
                          <label className="chk">
                            <input
                              type="checkbox"
                              checked={it.twinch_used}
                              onChange={(e) => {
                                const v = e.target.checked;
                                updateItem(it.key, {
                                  twinch_used: v,
                                  twinch_h: v ? it.maschinenstunden_h : "",
                                });
                              }}
                            />
                            Twinch genutzt
                          </label>

                          <label className="field">
                            Twinch Stunden (h)
                            <input
                              value={it.twinch_h}
                              disabled={!it.twinch_used}
                              onChange={(e) => updateItem(it.key, { twinch_h: e.target.value })}
                              inputMode="decimal"
                              placeholder="z.B. 1,5"
                              className={`control ${!it.twinch_used ? "ro" : ""}`}
                            />
                          </label>
                        </div>

                        <label className="field">
                          Einsatz Kommentar
                          <textarea value={it.kommentar} onChange={(e) => updateItem(it.key, { kommentar: e.target.value })} className="control" style={{ minHeight: 80 }} />
                        </label>
                      </div>
                    </details>

                    <button type="button" onClick={() => removeItem(it.key)} className="btnSm" style={{ width: "fit-content" }}>
                      Einsatz löschen
                    </button>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      <div className="saveBar">
        <button type="button" onClick={save} disabled={saving} className="btnPrimary">
          {saving ? "Speichern..." : "Speichern"}
        </button>

        {msg && <div className="msg" role="status">{msg}</div>}
      </div>

      <style jsx>{`
        .wrap {
          --ink: #172a22;
          --muted: #4d6257;
          --line: #cddbd2;
          --surface: #f3f7f4;
          --accent: #215842;
          max-width: 960px;
          margin: 24px auto;
          padding: clamp(12px, 3vw, 28px);
          color: var(--ink);
          font-family: system-ui, sans-serif;
        }
        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          padding: clamp(16px, 4vw, 28px);
          border-radius: 20px;
          background: var(--surface);
        }
        .h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); line-height: 1.1; }
        .h2 { margin: 0 0 12px; font-size: 23px; }
        .sub { color: var(--muted); margin-top: 8px; }
        .link { color: var(--accent); margin-left: 8px; text-underline-offset: 3px; }
        .card {
          min-width: 0;
          margin-top: 16px;
          padding: clamp(12px, 3vw, 24px);
          border: 1px solid var(--line);
          border-radius: 16px;
          background: #fff;
        }
        .lbl, .field { display: block; min-width: 0; font-size: 14px; font-weight: 650; }
        .dateInner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
        .dateInner > .control { width: min(100%, 190px); margin-top: 0; }
        .dateInner .row2 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .assignments { margin-top: 24px; }
        .head2 { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
        .grid { display: grid; gap: 10px; margin-top: 12px; }
        .grid > .card { margin-top: 0; }
        .sum, .sum2 { cursor: pointer; font-weight: 700; overflow-wrap: anywhere; }
        .sum::marker, .sum2::marker { color: var(--accent); }
        .inner { display: grid; gap: 12px; margin-top: 12px; }
        .row2, .row3 { display: grid; gap: 10px; }
        .row2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .row3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .rowBtn { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .rowBtn :global(.workdayTimeSelect) { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
        .rowBtn :global(.workdayTimeSelect select),
        .control {
          box-sizing: border-box;
          width: 100%;
          min-height: 44px;
          padding: 9px 10px;
          border: 1px solid var(--line);
          border-radius: 9px;
          background: #fff;
          color: var(--ink);
          font: 400 16px system-ui, sans-serif;
        }
        .rowBtn :global(.workdayTimeSelect select) { min-width: 0; flex: 1; padding-inline: 5px; }
        .control { margin-top: 6px; }
        textarea.control { resize: vertical; }
        .ro { background: var(--surface); }
        .btn, .btnWide, .btnSm, .btnPrimary {
          display: inline-flex;
          box-sizing: border-box;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 8px 12px;
          border: 1px solid var(--line);
          border-radius: 9px;
          background: #fff;
          color: var(--accent);
          font: 650 14px system-ui, sans-serif;
          text-decoration: none;
          cursor: pointer;
        }
        .btnSm { white-space: nowrap; }
        .btnPrimary { padding-inline: 22px; background: var(--accent); color: #fff; font-size: 16px; }
        .btn:disabled, .btnSm:disabled, .btnPrimary:disabled { cursor: default; opacity: .65; }
        .wrap :global(:focus-visible) { outline: 2px solid #33795b; outline-offset: 2px; }
        .warn, .hint, .msg {
          padding: 10px 12px;
          border-radius: 9px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .warn { background: #fff5de; color: #734600; }
        .warn.bad { background: #fff0ef; color: #a02424; }
        .subCard { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
        .hint { margin-top: 12px; background: var(--surface); }
        .msg { background: var(--surface); max-height: 28vh; overflow-y: auto; }
        .chk {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          box-sizing: border-box;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 9px;
          background: #fff;
          font-size: 14px;
          font-weight: 650;
        }
        .chk:has(input:checked) { background: var(--surface); border-color: var(--accent); }
        .chk input { margin: 0; width: 16px; height: 16px; accent-color: var(--accent); }
        .saveBar {
          position: sticky;
          bottom: 0;
          display: grid;
          justify-items: end;
          gap: 8px;
          margin-top: 16px;
          padding: 10px 0 max(10px, env(safe-area-inset-bottom));
          border-top: 1px solid var(--line);
          background: #fff;
        }
        .saveBar .msg { grid-row: 1; width: 100%; box-sizing: border-box; }
        @media (max-width: 560px) {
          .wrap { margin-block: 8px; }
          .row2 { grid-template-columns: minmax(0, 1fr); }
          .row3 { display: flex; flex-wrap: wrap; gap: 6px; }
          .row3 .chk { flex: 1 1 auto; }
          .saveBar .btnPrimary { width: 100%; }
        }
      `}</style>
    </main>
  );
}