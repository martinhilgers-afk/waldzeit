"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type WorkItem = {
  key: string; // nur UI
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

  // ✅ NEW: Twinch
  twinch_used: boolean;
  twinch_h: string;

  warnung: string; // UI
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toNumOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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

export default function NewWorkday() {
  const [userId, setUserId] = useState<string | null>(null);
  const [meName, setMeName] = useState<string>("");

  // ✅ Standard-Maschine aus Profil
  const [defaultMachine, setDefaultMachine] = useState<string>("");

  const [date, setDate] = useState(todayISO());
  const [arbeitsbeginn, setArbeitsbeginn] = useState("");
  const [arbeitsende, setArbeitsende] = useState("");
  const [tagesKommentar, setTagesKommentar] = useState("");

  // ✅ Tag-Flags
  const [isUrlaub, setIsUrlaub] = useState(false);
  const [isWetter, setIsWetter] = useState(false);

  const isSpecialDay = isUrlaub || isWetter;

  // Dropdown-Optionen
  const [objectOptions, setObjectOptions] = useState<string[]>([]);
  const [machineOptions, setMachineOptions] = useState<string[]>([]);

  const [items, setItems] = useState<WorkItem[]>(() => [
    {
      key: uid(),
      objekt: "",
      maschine: "", // wird nach Laden des Profils automatisch gesetzt (nur wenn leer)
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

      // ✅ Standard-Maschine merken
      setDefaultMachine(String((me as any).default_machine || ""));

      const [o, m] = await Promise.all([
        supabase.from("objects").select("name").eq("is_active", true).order("name", { ascending: true }),
        supabase.from("machines").select("name").eq("is_active", true).order("name", { ascending: true }),
      ]);

      setObjectOptions(((o.data as any[]) ?? []).map((x) => x.name));
      setMachineOptions(((m.data as any[]) ?? []).map((x) => x.name));
    })();
  }, []);

  // ✅ Letztes Objekt pro Benutzer automatisch vorbelegen (DB + localStorage)
  useEffect(() => {
    if (!userId) return;

    const lsKey = `waldzeit:last_objekt:${userId}`;

    // 1) Sofort: localStorage (schnell)
    const cached = typeof window !== "undefined" ? localStorage.getItem(lsKey) : null;
    if (cached && cached.trim()) {
      setItems((prev) =>
        prev.map((it, idx) => {
          if (idx !== 0) return it; // nur erster Einsatz
          if (it.objekt.trim()) return it; // nicht überschreiben
          return { ...it, objekt: cached };
        })
      );
    }

    // 2) Dann: DB (autoritative)
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
      if (!lastObj) return;

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
  }, [userId]);

  // ✅ ersten Einsatz automatisch Maschine vorbelegen (nur wenn leer)
  useEffect(() => {
    const dm = defaultMachine.trim();
    if (!dm) return;

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== 0) return it;
        if (it.maschine.trim()) return it;
        return { ...it, maschine: dm };
      })
    );
  }, [defaultMachine]);

  // ✅ Wenn Urlaub/Wetter aktiv: Arbeitszeiten leeren
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

    // Motorsäge: keine MAS-Vorschläge
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
      updateItem(itemKey, { last_mas_end: null });
      return;
    }

    const lastEnd = (data as any[])[0]?.mas_end;
    const lastEndNum = typeof lastEnd === "number" ? lastEnd : Number(lastEnd);
    if (!Number.isFinite(lastEndNum)) {
      updateItem(itemKey, { last_mas_end: null });
      return;
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;

        const base = { ...it, last_mas_end: lastEndNum };
        if (it.mas_start.trim()) return base;
        return { ...base, mas_start: String(lastEndNum) };
      })
    );
  }

  function calcMasHours(it: WorkItem) {
    const s = toNumOrNull(it.mas_start);
    const e = toNumOrNull(it.mas_end);
    if (s === null || e === null) return null;
    return e - s;
  }

  async function checkMachineHoursForDay(itemKey: string, it: WorkItem) {
    if (isSpecialDay) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    if (isMotorsaege(it.maschine)) {
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

    const deltaHours = e - s;

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

    const sum = total + deltaHours;

    if (sum > 24) {
      updateItem(itemKey, { warnung: `❌ Block: Maschine wäre am ${date} insgesamt ca. ${sum.toFixed(2)}h (>24h)` });
      return;
    }

    if (it.last_mas_end !== null && s < it.last_mas_end) {
      updateItem(itemKey, {
        warnung: `⚠️ Warnung: MAS Beginn (${s}) ist kleiner als zuletzt gespeichert (${it.last_mas_end}). Bitte prüfen.`,
      });
      return;
    }

    if (sum > 16) {
      updateItem(itemKey, { warnung: `⚠️ Hinweis: Maschine kommt am ${date} auf ca. ${sum.toFixed(2)}h` });
      return;
    }

    updateItem(itemKey, { warnung: "" });
  }

  const validationErrors = useMemo(() => {
    const errs: string[] = [];

    if (!date) errs.push("Datum fehlt.");

    // Urlaub/Wetter: keine Arbeitszeiten nötig/erlaubt
    if (!isSpecialDay) {
      if ((arbeitsbeginn && !arbeitsende) || (!arbeitsbeginn && arbeitsende)) {
        errs.push("Arbeitsbeginn und Arbeitsende bitte beide setzen (oder beide leer lassen).");
      }
    }

    if (!isSpecialDay) {
      items.forEach((it, idx) => {
        const n = idx + 1;
        if (!it.objekt.trim()) errs.push(`Einsatz ${n}: Objekt fehlt.`);
        if (!it.maschine.trim()) errs.push(`Einsatz ${n}: Maschine fehlt.`);

        const sonstH = toNumOrNull(it.sonstiges_h) ?? 0;
        if (sonstH > 0 && !it.sonstiges_beschreibung.trim()) {
          errs.push(`Einsatz ${n}: Bei Sonstiges > 0 ist eine Beschreibung Pflicht.`);
        }

        // ✅ MAS nur wenn NICHT Motorsäge
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

        // Twinch: wenn genutzt und Stunden gesetzt -> muss Zahl sein
        if (it.twinch_used) {
          const th = toNumOrNull(it.twinch_h);
          if (it.twinch_h.trim() !== "" && th === null) errs.push(`Einsatz ${n}: Twinch Stunden sind keine Zahl.`);
        }
      });
    }

    return errs;
  }, [date, arbeitsbeginn, arbeitsende, items, isSpecialDay]);

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

    // bestehende Items löschen (auch für Urlaub/Wetter sauber)
    const { error: delErr } = await supabase.from("work_items").delete().eq("workday_id", workdayId);
    if (delErr) {
      setSaving(false);
      setMsg("Fehler beim Löschen alter Einsätze: " + delErr.message);
      return;
    }

    // Urlaub/Wetter: keine Items speichern
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
      const delta = s !== null && e !== null ? e - s : null;

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

        <Link href="/app">
          <button className="btn">Zur Übersicht</button>
        </Link>
      </header>

      <section className="card">
        <h2 className="h2">Tag</h2>

        <label className="lbl">Datum</label>

        <div className="dateBox">
          <div className="dateInner">
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

            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="control" />
          </div>
        </div>

        {/* Urlaub/Wetter */}
        <div className="row2" style={{ marginTop: 12 }}>
          <label className="chk">
            <input
              type="checkbox"
              checked={isUrlaub}
              onChange={(e) => {
                const v = e.target.checked;
                setIsUrlaub(v);
                if (v) setIsWetter(false);
              }}
            />
            Urlaub
          </label>

          <label className="chk">
            <input
              type="checkbox"
              checked={isWetter}
              onChange={(e) => {
                const v = e.target.checked;
                setIsWetter(v);
                if (v) setIsUrlaub(false);
              }}
            />
            Wetter
          </label>
        </div>

        <div className="row2" style={{ marginTop: 12, opacity: isSpecialDay ? 0.55 : 1 }}>
          <label className="field">
            Arbeitsbeginn
            <div className="rowBtn">
              <input
                type="time"
                value={arbeitsbeginn}
                disabled={isSpecialDay}
                onChange={(e) => setArbeitsbeginn(e.target.value)}
                className="control"
              />
              <button type="button" disabled={isSpecialDay} onClick={() => setArbeitsbeginn(nowHHMM())} className="btnSm">
                Jetzt
              </button>
            </div>
          </label>

          <label className="field">
            Arbeitsende
            <div className="rowBtn">
              <input
                type="time"
                value={arbeitsende}
                disabled={isSpecialDay}
                onChange={(e) => setArbeitsende(e.target.value)}
                className="control"
              />
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
          <div className="hint">{isUrlaub ? "📌 Urlaub: Es werden keine Einsätze gespeichert." : "🌧️ Wetter: Tag zählt als Arbeitstag, aber ohne geleistete Stunden."}</div>
        )}
      </section>

      {/* Einsätze */}
      {!isSpecialDay && (
        <section style={{ marginTop: 14 }}>
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

                          // ✅ letztes Objekt merken
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

                          // ✅ Motorsäge: MAS komplett leeren + Warnung weg
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

                          updateItem(it.key, { maschine: v, warnung: "", last_mas_end: null });
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

                    {/* ✅ Motorsäge: MAS-Zeile komplett ausblenden und stattdessen Motormanuel hier anzeigen */}
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

                              // wenn Twinch an und twinch_h leer -> auto füllen
                              const maybeTwinch = it.twinch_used && (!it.twinch_h.trim() ? true : false) ? (delta === null ? "" : String(delta)) : it.twinch_h;

                              updateItem(it.key, {
                                mas_start: v,
                                maschinenstunden_h: delta === null ? "" : String(delta),
                                twinch_h: maybeTwinch,
                              });

                              checkMachineHoursForDay(it.key, next);
                            }}
                            inputMode="decimal"
                            placeholder="z.B. 2450.5"
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

                              const maybeTwinch = it.twinch_used && (!it.twinch_h.trim() ? true : false) ? (delta === null ? "" : String(delta)) : it.twinch_h;

                              updateItem(it.key, {
                                mas_end: v,
                                maschinenstunden_h: delta === null ? "" : String(delta),
                                twinch_h: maybeTwinch,
                              });

                              checkMachineHoursForDay(it.key, next);
                            }}
                            inputMode="decimal"
                            placeholder="z.B. 2456.0"
                            className="control"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="row2">
                        <label className="field">
                          Motormanuel (h)
                          <input
                            value={it.motormanuel_h}
                            onChange={(e) => updateItem(it.key, { motormanuel_h: e.target.value })}
                            inputMode="decimal"
                            placeholder="z.B. 2.0"
                            className="control"
                          />
                        </label>

                        <div className="field">
                          <div style={{ marginTop: 6, opacity: 0.75, fontWeight: 800 }}>Hinweis</div>
                          <div style={{ marginTop: 8, opacity: 0.8 }}>
                            Motorsäge: keine Maschinenstunden (MAS). Bitte Motormanuel hier eintragen.
                          </div>
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
                          {/* ✅ Motorsäge: Motormanuel ist oben sichtbar, hier ausblenden um Dopplung zu vermeiden */}
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
                            <input
                              value={it.sonstiges_beschreibung}
                              onChange={(e) => updateItem(it.key, { sonstiges_beschreibung: e.target.value })}
                              placeholder="z.B. Kette wechseln"
                              className="control"
                            />
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

                                // Vorschlag: wenn leer -> nimm MAS-Stunden
                                const nextTwinch = v && !it.twinch_h.trim() ? it.maschinenstunden_h : it.twinch_h;

                                updateItem(it.key, { twinch_used: v, twinch_h: nextTwinch });
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
                              placeholder="z.B. 1.5"
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

      <div style={{ marginTop: 14 }}>
        <button onClick={save} disabled={saving} className="btnPrimary">
          {saving ? "Speichern..." : "Speichern"}
        </button>

        {msg && <pre className="msg">{msg}</pre>}
      </div>

      <style jsx>{`
        .wrap {
          max-width: 900px;
          margin: 24px auto;
          padding: 12px;
        }
        .head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .h1 {
          margin: 0;
          font-size: 36px;
          line-height: 1.1;
        }
        .h2 {
          margin: 0 0 10px 0;
          font-size: 26px;
        }
        .sub {
          opacity: 0.82;
          margin-top: 6px;
        }
        .link {
          margin-left: 10px;
          text-decoration: underline;
        }

        .card {
          border: 1px solid #eee;
          border-radius: 16px;
          padding: 14px;
          margin-top: 12px;
          background: #fff;
        }

        .lbl {
          display: block;
          margin-top: 8px;
          font-weight: 700;
        }

        .dateBox {
          display: flex;
          justify-content: center;
          margin-top: 6px;
        }
        .dateInner {
          width: 100%;
          max-width: 360px;
        }

        .head2 {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .grid {
          display: grid;
          gap: 12px;
          margin-top: 12px;
        }

        .sum {
          cursor: pointer;
          font-weight: 900;
          font-size: 16px;
        }
        .sum2 {
          cursor: pointer;
          font-weight: 800;
        }

        .inner {
          display: grid;
          gap: 10px;
          margin-top: 12px;
        }

        .row2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .rowBtn {
          display: flex;
          gap: 8px;
          margin-top: 6px;
          align-items: center;
        }

        .field {
          display: block;
        }

        .control {
          width: 100%;
          padding: 12px;
          font-size: 16px;
          margin-top: 6px;
          border-radius: 12px;
          border: 1px solid #d9d9d9;
          background: #fff;
          box-sizing: border-box;
        }
        .control:focus {
          outline: none;
          border-color: #bdbdbd;
        }
        .ro {
          background: #f6f6f6;
        }

        .btn {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #ddd;
          background: #fff;
          font-weight: 800;
        }
        .btnWide {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #ddd;
          background: #fff;
          font-weight: 900;
        }
        .btnSm {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #ddd;
          background: #fff;
          font-weight: 800;
          white-space: nowrap;
        }
        .btnPrimary {
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #ddd;
          background: #fff;
          font-weight: 900;
          font-size: 16px;
        }

        .warn {
          white-space: pre-wrap;
          color: darkorange;
          font-weight: 700;
        }
        .warn.bad {
          color: crimson;
        }

        .subCard {
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 12px;
          background: #fff;
        }

        .msg {
          margin-top: 10px;
          white-space: pre-wrap;
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 10px;
        }

        .chk {
          display: flex;
          gap: 10px;
          align-items: center;
          font-weight: 800;
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 10px 12px;
          background: #fff;
        }

        .hint {
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px dashed #ddd;
          border-radius: 12px;
          background: #fafafa;
          font-weight: 700;
        }

        @media (max-width: 700px) {
          .h1 {
            font-size: 30px;
          }
          .row2 {
            grid-template-columns: 1fr;
          }
          .head {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </main>
  );
}