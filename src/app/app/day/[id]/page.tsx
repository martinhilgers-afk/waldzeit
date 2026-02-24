"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMe } from "@/lib/me";

type WorkItem = {
  key: string; // UI
  objekt: string;
  maschine: string;

  fahrtzeit_min: string;

  mas_start: string;
  mas_end: string;

  maschinenstunden_h: string; // Anzeige (Delta)

  last_mas_end: number | null; // für Warnung

  unterhalt_h: string;
  reparatur_h: string;
  motormanuel_h: string;
  umsetzen_h: string;
  sonstiges_h: string;
  sonstiges_beschreibung: string;

  diesel_l: string;
  adblue_l: string;

  kommentar: string;

  warnung: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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

function calcMasHours(it: WorkItem) {
  const s = toNumOrNull(it.mas_start);
  const e = toNumOrNull(it.mas_end);
  if (s === null || e === null) return null;
  return e - s;
}

export default function DayEditPage() {
  const params = useParams();
  const workdayId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [userId, setUserId] = useState<string | null>(null);
  const [meName, setMeName] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>("");

  const [date, setDate] = useState("");
  const [arbeitsbeginn, setArbeitsbeginn] = useState("");
  const [arbeitsende, setArbeitsende] = useState("");
  const [tagesKommentar, setTagesKommentar] = useState("");

  const [objectOptions, setObjectOptions] = useState<string[]>([]);
  const [machineOptions, setMachineOptions] = useState<string[]>([]);

  const [items, setItems] = useState<WorkItem[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

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
        warnung: "",
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.key !== key)));
  }

  // ✅ Vorschlag: letzter mas_end dieser Maschine (aber NICHT aus diesem Workday)
  async function suggestMasStart(maschineValue: string, itemKey: string) {
    const m = maschineValue.trim();
    if (!m || !workdayId) return;

    const { data, error } = await supabase
      .from("work_items")
      .select("mas_end, created_at, workday_id")
      .eq("maschine", m)
      .neq("workday_id", workdayId) // wichtig: nicht der aktuelle Tag
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

        // nur vorschlagen, wenn leer
        if (it.mas_start.trim()) return base;
        return { ...base, mas_start: String(lastEndNum) };
      })
    );
  }

  // ✅ Warnungen:
  // 1) MAS Beginn < zuletzt gespeichert (Warnung)
  // 2) Summe pro Maschine an dem Tag > 24h (Block) (basierend auf aktuellen Form-Items!)
  function validateMachineWarningsForItem(itemKey: string, nextItem: WorkItem) {
    const m = nextItem.maschine.trim();
    if (!m) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    const s = toNumOrNull(nextItem.mas_start);
    const e = toNumOrNull(nextItem.mas_end);

    // Warnung: kleiner als zuletzt gespeichert
    if (s !== null && nextItem.last_mas_end !== null && s < nextItem.last_mas_end) {
      updateItem(itemKey, {
        warnung: `⚠️ Warnung: MAS Beginn (${s}) ist kleiner als zuletzt gespeichert (${nextItem.last_mas_end}). Bitte prüfen.`,
      });
      return;
    }

    // Unvollständig -> keine weitere Prüfung
    if (s === null || e === null) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

    if (e < s) {
      updateItem(itemKey, { warnung: "❌ Block: MAS Ende ist kleiner als MAS Beginn." });
      return;
    }

    // Summe pro Maschine im aktuellen Formular
    const sum = items.reduce((acc, it) => {
      const mm = it.key === itemKey ? nextItem.maschine.trim() : it.maschine.trim();
      if (mm !== m) return acc;
      const candidate = it.key === itemKey ? nextItem : it;
      const d = calcMasHours(candidate);
      return acc + (d && Number.isFinite(d) ? d : 0);
    }, 0);

    if (sum > 24) {
      updateItem(itemKey, { warnung: `❌ Block: Maschine wäre am ${date || "Tag"} insgesamt ca. ${sum.toFixed(2)}h (>24h)` });
      return;
    }

    updateItem(itemKey, { warnung: "" });
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
      if (anyMas && (s === null || e === null)) errs.push(`Einsatz ${n}: MAS Beginn und MAS Ende bitte beide ausfüllen.`);
      if (s !== null && e !== null && e < s) errs.push(`Einsatz ${n}: MAS Ende darf nicht kleiner als MAS Beginn sein.`);

      if (it.warnung.includes("❌ Block")) errs.push(`Einsatz ${n}: Maschinenstunden-Check blockiert.`);
    });

    return errs;
  }, [date, arbeitsbeginn, arbeitsende, items]);

  async function loadAll() {
    if (!workdayId) return;

    setLoading(true);
    setLoadError("");
    setMsg("");

    const me = await getMe();
    if (!me) {
      location.href = "/";
      return;
    }
    setMeName(me.firstName);
    setUserId(me.id);

    // Dropdowns + Workday + Items parallel
    const [o, m, dayRes, itemsRes] = await Promise.all([
      supabase.from("objects").select("name").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("machines").select("name").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("workdays").select("id,date,arbeitsbeginn,arbeitsende,kommentar").eq("id", workdayId).limit(1),
      supabase
        .from("work_items")
        .select(
          "objekt,maschine,fahrtzeit_min,mas_start,mas_end,maschinenstunden_h,unterhalt_h,reparatur_h,motormanuel_h,umsetzen_h,sonstiges_h,sonstiges_beschreibung,diesel_l,adblue_l,kommentar,created_at"
        )
        .eq("workday_id", workdayId)
        .order("created_at", { ascending: true }),
    ]);

    if (dayRes.error) {
      setLoadError(dayRes.error.message);
      setLoading(false);
      return;
    }

    const day = (dayRes.data as any[])?.[0];
    if (!day) {
      setLoadError("Eintrag nicht gefunden.");
      setLoading(false);
      return;
    }

    setObjectOptions(((o.data as any[]) ?? []).map((x) => x.name));
    setMachineOptions(((m.data as any[]) ?? []).map((x) => x.name));

    setDate(day.date ?? "");
    setArbeitsbeginn(day.arbeitsbeginn ?? "");
    setArbeitsende(day.arbeitsende ?? "");
    setTagesKommentar(day.kommentar ?? "");

    const mapped: WorkItem[] = (((itemsRes.data as any[]) ?? []) as any[]).map((r) => {
      const s = r.mas_start ?? null;
      const e = r.mas_end ?? null;
      const delta = s !== null && e !== null ? Number(e) - Number(s) : r.maschinenstunden_h ?? null;

      return {
        key: uid(),
        objekt: r.objekt ?? "",
        maschine: r.maschine ?? "",
        fahrtzeit_min: r.fahrtzeit_min === null || r.fahrtzeit_min === undefined ? "" : String(r.fahrtzeit_min),

        mas_start: s === null || s === undefined ? "" : String(s),
        mas_end: e === null || e === undefined ? "" : String(e),
        maschinenstunden_h: delta === null || delta === undefined ? "" : String(delta),

        last_mas_end: null,

        unterhalt_h: r.unterhalt_h == null ? "" : String(r.unterhalt_h),
        reparatur_h: r.reparatur_h == null ? "" : String(r.reparatur_h),
        motormanuel_h: r.motormanuel_h == null ? "" : String(r.motormanuel_h),
        umsetzen_h: r.umsetzen_h == null ? "" : String(r.umsetzen_h),
        sonstiges_h: r.sonstiges_h == null ? "" : String(r.sonstiges_h),
        sonstiges_beschreibung: r.sonstiges_beschreibung ?? "",

        diesel_l: r.diesel_l == null ? "" : String(r.diesel_l),
        adblue_l: r.adblue_l == null ? "" : String(r.adblue_l),

        kommentar: r.kommentar ?? "",
        warnung: "",
      };
    });

    // Wenn keine Einsätze -> mindestens 1 leeren
    const normalized =
      mapped.length > 0
        ? mapped
        : [
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
              warnung: "",
            },
          ];

    setItems(normalized);

    // last_mas_end für Maschinen nachladen (damit Warnung/vorschlag sauber ist)
    await Promise.all(
      normalized
        .filter((x) => x.maschine.trim())
        .map((x) => suggestMasStart(x.maschine, x.key))
    );

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workdayId]);

  async function save() {
    if (!userId || !workdayId) return;

    setMsg("");

    if (validationErrors.length > 0) {
      setMsg("Bitte korrigieren:\n- " + validationErrors.join("\n- "));
      return;
    }

    setSaving(true);
    setMsg("Speichern...");

    // 1) Workday update
    const { error: dayErr } = await supabase
      .from("workdays")
      .update({
        date,
        arbeitsbeginn: arbeitsbeginn || null,
        arbeitsende: arbeitsende || null,
        kommentar: tagesKommentar.trim() || null,
      })
      .eq("id", workdayId);

    if (dayErr) {
      setSaving(false);
      setMsg("Fehler Workday: " + dayErr.message);
      return;
    }

    // 2) Items neu schreiben (idempotent)
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
  }

  if (loading) {
    return (
      <main className="wrap">
        <div className="card">
          <h1 className="h1">Eintrag bearbeiten</h1>
          <p style={{ opacity: 0.8, marginTop: 6 }}>Lade Daten…</p>
        </div>
        <style jsx>{baseStyles}</style>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="wrap">
        <div className="card">
          <h1 className="h1">Eintrag bearbeiten</h1>
          <div className="warn bad">❌ {loadError}</div>
          <Link href="/app">
            <button className="btn" style={{ marginTop: 10 }}>
              Zur Übersicht
            </button>
          </Link>
        </div>
        <style jsx>{baseStyles}</style>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1 className="h1">Eintrag bearbeiten</h1>
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

        <label className="field">
          Datum
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="control" />
        </label>

        <div className="row2" style={{ marginTop: 10 }}>
          <label className="field">
            Arbeitsbeginn
            <div className="rowBtn">
              <input type="time" value={arbeitsbeginn} onChange={(e) => setArbeitsbeginn(e.target.value)} className="control" />
              <button type="button" onClick={() => setArbeitsbeginn(nowHHMM())} className="btnSm">
                Jetzt
              </button>
            </div>
          </label>

          <label className="field">
            Arbeitsende
            <div className="rowBtn">
              <input type="time" value={arbeitsende} onChange={(e) => setArbeitsende(e.target.value)} className="control" />
              <button type="button" onClick={() => setArbeitsende(nowHHMM())} className="btnSm">
                Jetzt
              </button>
            </div>
          </label>
        </div>

        <label className="field" style={{ marginTop: 10 }}>
          Tages-Kommentar
          <textarea value={tagesKommentar} onChange={(e) => setTagesKommentar(e.target.value)} className="control" style={{ minHeight: 90 }} />
        </label>
      </section>

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
          {items.map((it, idx) => (
            <details key={it.key} open={idx === 0} className="card">
              <summary className="sum">
                Einsatz {idx + 1}: {it.objekt || "Objekt"} / {it.maschine || "Maschine"}
              </summary>

              <div className="inner">
                <label className="field">
                  Objekt *
                  <select
                    value={it.objekt}
                    onChange={(e) => updateItem(it.key, { objekt: e.target.value })}
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
                      updateItem(it.key, { maschine: v, warnung: "", last_mas_end: null });

                      if (v) {
                        await suggestMasStart(v, it.key);
                        // Warnungen direkt nochmal prüfen (mit neuem maschine)
                        const next = { ...it, maschine: v };
                        validateMachineWarningsForItem(it.key, next);
                      }
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
                    <input
                      value={it.fahrtzeit_min}
                      onChange={(e) => updateItem(it.key, { fahrtzeit_min: e.target.value })}
                      inputMode="numeric"
                      className="control"
                    />
                  </label>

                  <label className="field">
                    MAS Stunden (h) automatisch
                    <input value={it.maschinenstunden_h} readOnly placeholder="(aus MAS Beginn/Ende)" className="control ro" />
                  </label>
                </div>

                <div className="row2">
                  <label className="field">
                    MAS Beginn
                    <input
                      value={it.mas_start}
                      onChange={(e) => {
                        const v = e.target.value;
                        const next: WorkItem = { ...it, mas_start: v };
                        const delta = calcMasHours(next);

                        updateItem(it.key, {
                          mas_start: v,
                          maschinenstunden_h: delta === null ? "" : String(delta),
                        });

                        validateMachineWarningsForItem(it.key, next);
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
                        const next: WorkItem = { ...it, mas_end: v };
                        const delta = calcMasHours(next);

                        updateItem(it.key, {
                          mas_end: v,
                          maschinenstunden_h: delta === null ? "" : String(delta),
                        });

                        validateMachineWarningsForItem(it.key, next);
                      }}
                      inputMode="decimal"
                      placeholder="z.B. 2456.0"
                      className="control"
                    />
                  </label>
                </div>

                {it.warnung && <div className={it.warnung.includes("❌") ? "warn bad" : "warn"}>{it.warnung}</div>}

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
                      <label className="field">
                        Motormanuel (h)
                        <input value={it.motormanuel_h} onChange={(e) => updateItem(it.key, { motormanuel_h: e.target.value })} inputMode="decimal" className="control" />
                      </label>
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
          ))}
        </div>
      </section>

      <div style={{ marginTop: 14 }}>
        <button onClick={save} disabled={saving} className="btnPrimary">
          {saving ? "Speichern..." : "Speichern"}
        </button>

        <button onClick={loadAll} disabled={saving} className="btn" style={{ marginLeft: 10 }}>
          Neu laden
        </button>

        {msg && <pre className="msg">{msg}</pre>}
      </div>

      <style jsx>{baseStyles}</style>
    </main>
  );
}

const baseStyles = `
.wrap{max-width:900px;margin:24px auto;padding:12px}
.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.h1{margin:0;font-size:36px;line-height:1.1}
.h2{margin:0 0 10px 0;font-size:26px}
.sub{opacity:.82;margin-top:6px}
.link{margin-left:10px;text-decoration:underline}
.card{border:1px solid #eee;border-radius:16px;padding:14px;margin-top:12px;background:#fff}
.head2{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
.grid{display:grid;gap:12px;margin-top:12px}
.sum{cursor:pointer;font-weight:900;font-size:16px}
.sum2{cursor:pointer;font-weight:800}
.inner{display:grid;gap:10px;margin-top:12px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rowBtn{display:flex;gap:8px;margin-top:6px;align-items:center}
.field{display:block}
.control{width:100%;padding:12px;font-size:16px;margin-top:6px;border-radius:12px;border:1px solid #d9d9d9;background:#fff;box-sizing:border-box}
.control:focus{outline:none;border-color:#bdbdbd}
.ro{background:#f6f6f6}
.btn{padding:10px 12px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:800}
.btnSm{padding:10px 12px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:800;white-space:nowrap}
.btnPrimary{padding:14px 16px;border-radius:12px;border:1px solid #ddd;background:#fff;font-weight:900;font-size:16px}
.warn{white-space:pre-wrap;color:darkorange;font-weight:700}
.warn.bad{color:crimson}
.subCard{border:1px solid #eee;border-radius:14px;padding:12px;background:#fff}
.msg{margin-top:10px;white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:10px}
@media (max-width:700px){
  .h1{font-size:30px}
  .row2{grid-template-columns:1fr}
  .head{flex-direction:column;align-items:stretch}
}
`;