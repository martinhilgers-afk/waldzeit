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

      <div style={{ marginTop: 14 }}>
        <button onClick={save} disabled={saving} className="btnPrimary">
          {saving ? "Speichern..." : "Speichern"}
        </button>

        {msg && <pre className="msg">{msg}</pre>}
      </div>

      <style jsx>{`
        .wrap { max-width: 900px; margin: 24px auto; padding: 12px; }
        .head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
        .h1 { margin: 0; font-size: 36px; line-height: 1.1; }
        .h2 { margin: 0 0 10px 0; font-size: 26px; }
        .sub { opacity: 0.82; margin-top: 6px; }
        .link { margin-left: 10px; text-decoration: underline; }
        .card { border: 1px solid #eee; border-radius: 16px; padding: 14px; margin-top: 12px; background: #fff; }
        .lbl { display: block; margin-top: 8px; font-weight: 700; }
        .dateBox { display: flex; justify-content: center; margin-top: 6px; }
        .dateInner { width: 100%; max-width: 360px; }
        .head2 { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
        .grid { display: grid; gap: 12px; margin-top: 12px; }
        .sum { cursor: pointer; font-weight: 900; font-size: 16px; }
        .sum2 { cursor: pointer; font-weight: 800; }
        .inner { display: grid; gap: 10px; margin-top: 12px; }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .rowBtn { display: flex; gap: 8px; margin-top: 6px; align-items: center; }
        .timeSelect { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
        .timeSelect .control { min-width: 0; flex: 1; padding: 12px 5px; }
        .timeColon { font-weight: 800; }
        .field { display: block; }
        .control { width: 100%; padding: 12px; font-size: 16px; margin-top: 6px; border-radius: 12px; border: 1px solid #d9d9d9; background: #fff; box-sizing: border-box; }
        .control:focus { outline: none; border-color: #bdbdbd; }
        .ro { background: #f6f6f6; }
        .btn, .btnWide, .btnSm, .btnPrimary { border-radius: 12px; border: 1px solid #ddd; background: #fff; font-weight: 800; }
        .btn { padding: 10px 12px; }
        .btnWide { padding: 10px 12px; font-weight: 900; }
        .btnSm { padding: 10px 12px; white-space: nowrap; }
        .btnPrimary { padding: 14px 16px; font-weight: 900; font-size: 16px; }
        .warn { white-space: pre-wrap; color: darkorange; font-weight: 700; }
        .warn.bad { color: crimson; }
        .subCard { border: 1px solid #eee; border-radius: 14px; padding: 12px; background: #fff; }
        .msg { margin-top: 10px; white-space: pre-wrap; background: #fafafa; border: 1px solid #eee; border-radius: 12px; padding: 10px; }
        .chk { display: flex; gap: 10px; align-items: center; font-weight: 800; border: 1px solid #eee; border-radius: 12px; padding: 10px 12px; background: #fff; }
        .hint { margin-top: 12px; padding: 10px 12px; border: 1px dashed #ddd; border-radius: 12px; background: #fafafa; font-weight: 700; }
        @media (max-width: 700px) {
          .h1 { font-size: 30px; }
          .row2, .row3 { grid-template-columns: 1fr; }
          .head { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </main>
  );
}