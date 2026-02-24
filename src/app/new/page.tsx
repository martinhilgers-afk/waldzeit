"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";
import { useSearchParams } from "next/navigation";

type WorkItem = {
  key: string; // nur UI
  objekt: string;
  maschine: string;

  fahrtzeit_min: string;

  // Maschinenstunden als Start/Ende
  mas_start: string;
  mas_end: string;

  // NEU: zuletzt gespeichertes MAS Ende (für Warnung)
  last_mas_end: number | null;

  // Anzeige / Export (aus Beginn/Ende berechnet)
  maschinenstunden_h: string;

  unterhalt_h: string;
  reparatur_h: string;
  motormanuel_h: string;
  umsetzen_h: string;
  sonstiges_h: string;
  sonstiges_beschreibung: string;

  diesel_l: string;
  adblue_l: string;

  kommentar: string;

  warnung: string; // UI: Maschinencheck
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

export default function NewWorkday() {
  const [userId, setUserId] = useState<string | null>(null);
  const [meName, setMeName] = useState<string>("");

  const [date, setDate] = useState(todayISO());
  const [arbeitsbeginn, setArbeitsbeginn] = useState("");
  const [arbeitsende, setArbeitsende] = useState("");
  const [tagesKommentar, setTagesKommentar] = useState("");

  // Dropdown-Optionen
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
      last_mas_end: null,
      maschinenstunden_h: "",
      unterhalt_h: "",
      reparatur_h: "",
      motormanuel_h: "",
      umsetzen_h: "",
      sonstiges_h: "",
      sonstiges_beschreibung: "",
      diesel_l: "",
      adblue_l: "",
      kommentar: "",
      warnung: "",
    },
  ]);

  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
const searchParams = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search)
  : null;
  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }
      setMeName(me.firstName);
      setUserId(me.id);
const dateFromUrl = searchParams?.get("date");
if (dateFromUrl) {
  setDate(dateFromUrl);

  // bestehenden Workday + Items laden
  const { data: wd, error } = await supabase
    .from("workdays")
    .select("id,arbeitsbeginn,arbeitsende,kommentar,work_items(*)")
    .eq("user_id", me.id)
    .eq("date", dateFromUrl)
    .limit(1);

  if (!error && wd && wd.length > 0) {
    const row: any = wd[0];
    setArbeitsbeginn(row.arbeitsbeginn ?? "");
    setArbeitsende(row.arbeitsende ?? "");
    setTagesKommentar(row.kommentar ?? "");

    const wi: any[] = row.work_items ?? [];
    if (wi.length > 0) {
      setItems(
        wi.map((x) => ({
          key: uid(),
          objekt: x.objekt ?? "",
          maschine: x.maschine ?? "",
          fahrtzeit_min: x.fahrtzeit_min?.toString?.() ?? "",
          mas_start: x.mas_start?.toString?.() ?? "",
          mas_end: x.mas_end?.toString?.() ?? "",
          last_mas_end: null,
          maschinenstunden_h: x.maschinenstunden_h?.toString?.() ?? "",
          unterhalt_h: x.unterhalt_h?.toString?.() ?? "",
          reparatur_h: x.reparatur_h?.toString?.() ?? "",
          motormanuel_h: x.motormanuel_h?.toString?.() ?? "",
          umsetzen_h: x.umsetzen_h?.toString?.() ?? "",
          sonstiges_h: x.sonstiges_h?.toString?.() ?? "",
          sonstiges_beschreibung: x.sonstiges_beschreibung ?? "",
          diesel_l: x.diesel_l?.toString?.() ?? "",
          adblue_l: x.adblue_l?.toString?.() ?? "",
          kommentar: x.kommentar ?? "",
          warnung: "",
        }))
      );
    }
  }
}
      // Stammdaten laden (für Dropdowns)
      const [o, m] = await Promise.all([
        supabase.from("objects").select("name").eq("is_active", true).order("name", { ascending: true }),
        supabase.from("machines").select("name").eq("is_active", true).order("name", { ascending: true }),
      ]);

      setObjectOptions(((o.data as any[]) ?? []).map((x) => x.name));
      setMachineOptions(((m.data as any[]) ?? []).map((x) => x.name));
    })();
  }, []);

  function updateItem(key: string, patch: Partial<WorkItem>) {
    setItems((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        key: uid(),
        objekt: "",
        maschine: "",
        fahrtzeit_min: "",
        mas_start: "",
        mas_end: "",
        last_mas_end: null,
        maschinenstunden_h: "",
        unterhalt_h: "",
        reparatur_h: "",
        motormanuel_h: "",
        umsetzen_h: "",
        sonstiges_h: "",
        sonstiges_beschreibung: "",
        diesel_l: "",
        adblue_l: "",
        kommentar: "",
        warnung: "",
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.key !== key)));
  }

  // ✅ Fahrtzeit-Vorschlag: letzter Wert des Users für dieses Objekt
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

  // ✅ MAS Beginn Vorschlag + last_mas_end merken (benutzerübergreifend)
  async function suggestMasStart(maschineValue: string, itemKey: string) {
    const m = maschineValue.trim();
    if (!m) return;

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
    if (typeof lastEnd !== "number") {
      updateItem(itemKey, { last_mas_end: null });
      return;
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;

        // lastEnd immer merken
        if (!it.mas_start.trim()) {
          // und vorschlagen
          return { ...it, last_mas_end: lastEnd, mas_start: String(lastEnd) };
        }
        return { ...it, last_mas_end: lastEnd };
      })
    );
  }

  // ✅ Checks:
  // - Ende < Beginn => ❌ Block
  // - Delta > 24 => ❌ Block
  // - Beginn < zuletzt gespeichertes Ende => ⚠️ Warnung
  // - Tages-Summe pro Maschine >24 => ❌ Block, >16 => ⚠️ Hinweis
  async function checkMachineHoursForDay(itemKey: string, itSnapshot: WorkItem) {
    const m = itSnapshot.maschine.trim();
    if (!m || !date) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    const s = toNumOrNull(itSnapshot.mas_start);
    const e = toNumOrNull(itSnapshot.mas_end);

    // Wenn noch nicht beide Zahlen da sind: keine Warnung
    if (s === null || e === null) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    if (e < s) {
      updateItem(itemKey, { warnung: "❌ Block: MAS Ende ist kleiner als MAS Beginn." });
      return;
    }

    const delta = e - s;

    if (delta > 24) {
      updateItem(itemKey, { warnung: `❌ Block: Maschinenstunden für einen Einsatz sind ${delta.toFixed(2)}h (>24h).` });
      return;
    }

    let localWarn = "";
    if (typeof itSnapshot.last_mas_end === "number" && Number.isFinite(itSnapshot.last_mas_end)) {
      if (s < itSnapshot.last_mas_end) {
        localWarn = `⚠️ Hinweis: MAS Beginn (${s}) ist kleiner als zuletzt gespeichert (${itSnapshot.last_mas_end}). Stimmt die Maschine?`;
      }
    }

    const { data, error } = await supabase.rpc("machine_hours_total", {
      p_date: date,
      p_maschine: m,
    });

    if (error) {
      updateItem(itemKey, { warnung: localWarn });
      return;
    }

    const total = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(total)) {
      updateItem(itemKey, { warnung: localWarn });
      return;
    }

    const sum = total + delta;

    if (sum > 24) {
      updateItem(itemKey, { warnung: `❌ Block: Maschine wäre am ${date} insgesamt ca. ${sum.toFixed(2)}h (>24h)` });
    } else if (sum > 16) {
      updateItem(itemKey, { warnung: `⚠️ Hinweis: Maschine kommt am ${date} auf ca. ${sum.toFixed(2)}h` });
    } else {
      updateItem(itemKey, { warnung: localWarn });
    }
  }

  const validationErrors = useMemo(() => {
    const errs: string[] = [];

    if (!date) errs.push("Datum fehlt.");

    if ((arbeitsbeginn && !arbeitsende) || (!arbeitsbeginn && arbeitsende)) {
      errs.push("Arbeitsbeginn und Arbeitsende bitte beide setzen (oder beide leer lassen).");
    }

    items.forEach((it, idx) => {
      const n = idx + 1;
      if (!it.objekt.trim()) errs.push(`Einsatz ${n}: Objekt fehlt.`);
      if (!it.maschine.trim()) errs.push(`Einsatz ${n}: Maschine fehlt.`);

      const sonstH = toNumOrNull(it.sonstiges_h) ?? 0;
      if (sonstH > 0 && !it.sonstiges_beschreibung.trim()) {
        errs.push(`Einsatz ${n}: Bei Sonstiges > 0 ist eine Beschreibung Pflicht.`);
      }

      const s = toNumOrNull(it.mas_start);
      const e = toNumOrNull(it.mas_end);
      const anyMas = it.mas_start.trim() !== "" || it.mas_end.trim() !== "";
      if (anyMas && (s === null || e === null)) {
        errs.push(`Einsatz ${n}: MAS Beginn und MAS Ende bitte beide ausfüllen.`);
      }
      if (s !== null && e !== null && e < s) {
        errs.push(`Einsatz ${n}: MAS Ende darf nicht kleiner als MAS Beginn sein.`);
      }
      if (s !== null && e !== null && e - s > 24) {
        errs.push(`Einsatz ${n}: MAS Differenz > 24h ist nicht erlaubt.`);
      }

      if (it.warnung.includes("❌ Block")) {
        errs.push(`Einsatz ${n}: Maschinenstunden-Check blockiert.`);
      }
    });

    return errs;
  }, [date, arbeitsbeginn, arbeitsende, items]);

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
          arbeitsbeginn: arbeitsbeginn || null,
          arbeitsende: arbeitsende || null,
          kommentar: tagesKommentar.trim() || null,
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

    const payload = items.map((it) => {
      const s = toNumOrNull(it.mas_start);
      const e = toNumOrNull(it.mas_end);
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
    }, 400);
  }

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0 }}>Neuer Tag</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Angemeldet als: <b>{meName || "…"}</b>{" "}
            <Link href="/profile" style={{ marginLeft: 10 }}>
              Profil
            </Link>
          </div>
        </div>

        <Link href="/app">
          <button style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>Zur Übersicht</button>
        </Link>
      </header>

      <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Tag</h2>

        <label style={{ display: "block", marginTop: 12 }}>Datum</label>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <div style={{ width: "100%", maxWidth: 360 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setDate(todayISO())}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 800, background: "#fff" }}
              >
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
                style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 800, background: "#fff" }}
              >
                Gestern
              </button>
            </div>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: 16, borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <label>
            Arbeitsbeginn
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input type="time" value={arbeitsbeginn} onChange={(e) => setArbeitsbeginn(e.target.value)} style={{ width: "100%", padding: 12, fontSize: 16 }} />
              <button type="button" onClick={() => setArbeitsbeginn(nowHHMM())} style={{ padding: 12 }}>
                Jetzt
              </button>
            </div>
          </label>

          <label>
            Arbeitsende
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input type="time" value={arbeitsende} onChange={(e) => setArbeitsende(e.target.value)} style={{ width: "100%", padding: 12, fontSize: 16 }} />
              <button type="button" onClick={() => setArbeitsende(nowHHMM())} style={{ padding: 12 }}>
                Jetzt
              </button>
            </div>
          </label>
        </div>

        <label style={{ display: "block", marginTop: 12 }}>
          Tages-Kommentar
          <textarea value={tagesKommentar} onChange={(e) => setTagesKommentar(e.target.value)} style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6, minHeight: 80 }} />
        </label>
      </section>

      <section style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Einsätze</h2>
          <button onClick={addItem} style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 800 }}>
            + Einsatz hinzufügen
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {items.map((it, idx) => (
            <details key={it.key} open={idx === 0} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                Einsatz {idx + 1}: {it.objekt || "Objekt"} / {it.maschine || "Maschine"}
              </summary>

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <label>
                  Objekt *
                  <select
                    value={it.objekt}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateItem(it.key, { objekt: v });
                      if (v.trim().length >= 2) suggestFahrtzeit(v, it.key);
                    }}
                    style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                  >
                    <option value="">Bitte wählen…</option>
                    {objectOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Maschine *
                  <select
                    value={it.maschine}
                    onChange={(e) => {
                      const v = e.target.value;

                      // maschine setzen + warnung reset
                      updateItem(it.key, { maschine: v, warnung: "" });

                      if (v) {
                        // lastEnd merken + ggf. mas_start vorschlagen
                        suggestMasStart(v, it.key);
                      }

                      // Check mit Snapshot
                      const snap = { ...it, maschine: v };
                      checkMachineHoursForDay(it.key, snap);
                    }}
                    style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                  >
                    <option value="">Bitte wählen…</option>
                    {machineOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    Fahrtzeit (Min.)
                    <input
                      value={it.fahrtzeit_min}
                      onChange={(e) => updateItem(it.key, { fahrtzeit_min: e.target.value })}
                      inputMode="numeric"
                      style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                    />
                  </label>

                  <label>
                    MAS Stunden (h) automatisch
                    <input
                      value={it.maschinenstunden_h}
                      readOnly
                      placeholder="(aus MAS Beginn/Ende)"
                      style={{
                        width: "100%",
                        padding: 12,
                        fontSize: 16,
                        marginTop: 6,
                        background: "#f7f7f7",
                        border: "1px solid #ddd",
                        borderRadius: 8,
                      }}
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    MAS Beginn
                    <input
                      value={it.mas_start}
                      onChange={(e) => {
                        const v = e.target.value;
                        const s = toNumOrNull(v);
                        const eNum = toNumOrNull(it.mas_end);
                        const delta = s !== null && eNum !== null ? eNum - s : null;

                        updateItem(it.key, {
                          mas_start: v,
                          maschinenstunden_h: delta === null ? "" : String(delta),
                        });

                        const snap = { ...it, mas_start: v, maschinenstunden_h: delta === null ? "" : String(delta) };
                        checkMachineHoursForDay(it.key, snap);
                      }}
                      inputMode="decimal"
                      placeholder="z.B. 2450.5"
                      style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                    />
                  </label>

                  <label>
                    MAS Ende
                    <input
                      value={it.mas_end}
                      onChange={(e) => {
                        const v = e.target.value;
                        const s = toNumOrNull(it.mas_start);
                        const eNum = toNumOrNull(v);
                        const delta = s !== null && eNum !== null ? eNum - s : null;

                        updateItem(it.key, {
                          mas_end: v,
                          maschinenstunden_h: delta === null ? "" : String(delta),
                        });

                        const snap = { ...it, mas_end: v, maschinenstunden_h: delta === null ? "" : String(delta) };
                        checkMachineHoursForDay(it.key, snap);
                      }}
                      inputMode="decimal"
                      placeholder="z.B. 2456.0"
                      style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                    />
                  </label>
                </div>

                {it.warnung && (
                  <div style={{ whiteSpace: "pre-wrap", color: it.warnung.includes("❌") ? "crimson" : "darkorange" }}>
                    {it.warnung}
                  </div>
                )}

                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 800 }}>Tätigkeiten / Diesel / Details</summary>

                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label>
                        Unterhalt (h)
                        <input value={it.unterhalt_h} onChange={(e) => updateItem(it.key, { unterhalt_h: e.target.value })} inputMode="decimal" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>

                      <label>
                        Reparatur (h)
                        <input value={it.reparatur_h} onChange={(e) => updateItem(it.key, { reparatur_h: e.target.value })} inputMode="decimal" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label>
                        Motormanuel (h)
                        <input value={it.motormanuel_h} onChange={(e) => updateItem(it.key, { motormanuel_h: e.target.value })} inputMode="decimal" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>

                      <label>
                        Umsetzen (h)
                        <input value={it.umsetzen_h} onChange={(e) => updateItem(it.key, { umsetzen_h: e.target.value })} inputMode="decimal" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label>
                        Sonstiges (h)
                        <input value={it.sonstiges_h} onChange={(e) => updateItem(it.key, { sonstiges_h: e.target.value })} inputMode="decimal" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>

                      <label>
                        Sonstiges Beschreibung
                        <input value={it.sonstiges_beschreibung} onChange={(e) => updateItem(it.key, { sonstiges_beschreibung: e.target.value })} placeholder="z.B. Kette wechseln" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label>
                        Diesel (L)
                        <input value={it.diesel_l} onChange={(e) => updateItem(it.key, { diesel_l: e.target.value })} inputMode="decimal" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>

                      <label>
                        AdBlue (L)
                        <input value={it.adblue_l} onChange={(e) => updateItem(it.key, { adblue_l: e.target.value })} inputMode="decimal" style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }} />
                      </label>
                    </div>

                    <label>
                      Einsatz Kommentar
                      <textarea value={it.kommentar} onChange={(e) => updateItem(it.key, { kommentar: e.target.value })} style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6, minHeight: 70 }} />
                    </label>
                  </div>
                </details>

                <button type="button" onClick={() => removeItem(it.key)} style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", width: "fit-content" }}>
                  Einsatz löschen
                </button>
              </div>
            </details>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={{ padding: 14, fontSize: 16, fontWeight: 900, borderRadius: 12, border: "1px solid #ddd" }}>
          {saving ? "Speichern..." : "Speichern"}
        </button>

        {msg && <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{msg}</pre>}
      </div>
    </main>
  );
}