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

  const [items, setItems] = useState<WorkItem[]>(() => [
    {
      key: uid(),
      objekt: "",
      maschine: "",
      fahrtzeit_min: "",
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

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me) {
        location.href = "/";
        return;
      }
      setMeName(me.firstName);
      setUserId(me.id);
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
    if (obj.length < 3) return;

    // 1) letzte Workdays des Users
    const { data: days, error: dayErr } = await supabase
      .from("workdays")
      .select("id,date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60);

    if (dayErr || !days || days.length === 0) return;

    const ids = (days as any[]).map((d) => d.id);

    // 2) letzter Einsatz mit diesem Objekt (nur fahrtzeit_min)
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
      // nur setzen, wenn der Nutzer noch nichts eingetragen hat
      setItems((prev) =>
        prev.map((it) => {
          if (it.key !== itemKey) return it;
          if (it.fahrtzeit_min.trim()) return it;
          return { ...it, fahrtzeit_min: String(v) };
        })
      );
    }
  }

  // ✅ Maschinenstunden Check benutzerübergreifend (Warnung/Block)
  async function checkMachine(itemKey: string, maschine: string, maschinenstunden_h: string) {
    const m = maschine.trim();
    const add = toNumOrNull(maschinenstunden_h);
    if (!m || add === null || !date) {
      updateItem(itemKey, { warnung: "" });
      return;
    }

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

    const sum = total + add;
    if (sum > 24) {
      updateItem(itemKey, { warnung: `❌ Block: Maschine wäre am ${date} insgesamt ca. ${sum.toFixed(2)}h (>24h)` });
    } else if (sum > 16) {
      updateItem(itemKey, { warnung: `⚠️ Hinweis: Maschine kommt am ${date} auf ca. ${sum.toFixed(2)}h` });
    } else {
      updateItem(itemKey, { warnung: "" });
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

      if (it.warnung.includes("❌ Block")) {
        errs.push(`Einsatz ${n}: Maschinenstunden-Check blockiert (>24h).`);
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

    // 1) Workday upsert (user_id + date unique)
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

    // 2) Idempotent: alte Einsätze des Tages löschen, dann neu schreiben
    const { error: delErr } = await supabase.from("work_items").delete().eq("workday_id", workdayId);
    if (delErr) {
      setSaving(false);
      setMsg("Fehler beim Löschen alter Einsätze: " + delErr.message);
      return;
    }

    // 3) Neue Einsätze schreiben
    const payload = items.map((it) => ({
      workday_id: workdayId,
      objekt: it.objekt.trim(),
      maschine: it.maschine.trim(),
      fahrtzeit_min: toIntOrNull(it.fahrtzeit_min),
      maschinenstunden_h: toNumOrNull(it.maschinenstunden_h),

      unterhalt_h: toNumOrNull(it.unterhalt_h),
      reparatur_h: toNumOrNull(it.reparatur_h),
      motormanuel_h: toNumOrNull(it.motormanuel_h),
      umsetzen_h: toNumOrNull(it.umsetzen_h),
      sonstiges_h: toNumOrNull(it.sonstiges_h),
      sonstiges_beschreibung: it.sonstiges_beschreibung.trim() || null,

      diesel_l: toNumOrNull(it.diesel_l),
      adblue_l: toNumOrNull(it.adblue_l),

      kommentar: it.kommentar.trim() || null,
    }));

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

      {/* Tageskopf */}
      <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Tag</h2>

        <label style={{ display: "block", marginTop: 8 }}>
          Datum
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <label>
            Arbeitsbeginn
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                type="time"
                value={arbeitsbeginn}
                onChange={(e) => setArbeitsbeginn(e.target.value)}
                style={{ width: "100%", padding: 12, fontSize: 16 }}
              />
              <button type="button" onClick={() => setArbeitsbeginn(nowHHMM())} style={{ padding: 12 }}>
                Jetzt
              </button>
            </div>
          </label>

          <label>
            Arbeitsende
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                type="time"
                value={arbeitsende}
                onChange={(e) => setArbeitsende(e.target.value)}
                style={{ width: "100%", padding: 12, fontSize: 16 }}
              />
              <button type="button" onClick={() => setArbeitsende(nowHHMM())} style={{ padding: 12 }}>
                Jetzt
              </button>
            </div>
          </label>
        </div>

        <label style={{ display: "block", marginTop: 12 }}>
          Tages-Kommentar
          <textarea
            value={tagesKommentar}
            onChange={(e) => setTagesKommentar(e.target.value)}
            style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6, minHeight: 80 }}
          />
        </label>
      </section>

      {/* Einsätze */}
      <section style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Einsätze</h2>
          <button
            onClick={addItem}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
            }}
          >
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
                  <input
                    value={it.objekt}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateItem(it.key, { objekt: v });
                      if (v.trim().length >= 3) suggestFahrtzeit(v, it.key);
                    }}
                    style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                  />
                </label>

                <label>
                  Maschine *
                  <input
                    value={it.maschine}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateItem(it.key, { maschine: v });
                      checkMachine(it.key, v, it.maschinenstunden_h);
                    }}
                    style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                  />
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
                    Maschinenstunden (h)
                    <input
                      value={it.maschinenstunden_h}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateItem(it.key, { maschinenstunden_h: v });
                        checkMachine(it.key, it.maschine, v);
                      }}
                      inputMode="decimal"
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
                        <input
                          value={it.unterhalt_h}
                          onChange={(e) => updateItem(it.key, { unterhalt_h: e.target.value })}
                          inputMode="decimal"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>

                      <label>
                        Reparatur (h)
                        <input
                          value={it.reparatur_h}
                          onChange={(e) => updateItem(it.key, { reparatur_h: e.target.value })}
                          inputMode="decimal"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label>
                        Motormanuel (h)
                        <input
                          value={it.motormanuel_h}
                          onChange={(e) => updateItem(it.key, { motormanuel_h: e.target.value })}
                          inputMode="decimal"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>

                      <label>
                        Umsetzen (h)
                        <input
                          value={it.umsetzen_h}
                          onChange={(e) => updateItem(it.key, { umsetzen_h: e.target.value })}
                          inputMode="decimal"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label>
                        Sonstiges (h)
                        <input
                          value={it.sonstiges_h}
                          onChange={(e) => updateItem(it.key, { sonstiges_h: e.target.value })}
                          inputMode="decimal"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>

                      <label>
                        Sonstiges Beschreibung
                        <input
                          value={it.sonstiges_beschreibung}
                          onChange={(e) => updateItem(it.key, { sonstiges_beschreibung: e.target.value })}
                          placeholder="z.B. Kette wechseln"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label>
                        Diesel (L)
                        <input
                          value={it.diesel_l}
                          onChange={(e) => updateItem(it.key, { diesel_l: e.target.value })}
                          inputMode="decimal"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>

                      <label>
                        AdBlue (L)
                        <input
                          value={it.adblue_l}
                          onChange={(e) => updateItem(it.key, { adblue_l: e.target.value })}
                          inputMode="decimal"
                          style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6 }}
                        />
                      </label>
                    </div>

                    <label>
                      Einsatz Kommentar
                      <textarea
                        value={it.kommentar}
                        onChange={(e) => updateItem(it.key, { kommentar: e.target.value })}
                        style={{ width: "100%", padding: 12, fontSize: 16, marginTop: 6, minHeight: 70 }}
                      />
                    </label>
                  </div>
                </details>

                <button
                  type="button"
                  onClick={() => removeItem(it.key)}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", width: "fit-content" }}
                >
                  Einsatz löschen
                </button>
              </div>
            </details>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 14 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ padding: 14, fontSize: 16, fontWeight: 900, borderRadius: 12, border: "1px solid #ddd" }}
        >
          {saving ? "Speichern..." : "Speichern"}
        </button>

        {msg && <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{msg}</pre>}
      </div>
    </main>
  );
}