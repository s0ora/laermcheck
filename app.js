import { KATEGORIEN, STUFEN, kategorie, istStreng, pruefeMesswert, bewerte, alternativen } from "./rules.js?v=6";

const FEHLT = "__fehlt";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dbFmt = (n) => String(n).replace(".", ",");
const datum = (iso) => iso.split("-").reverse().join(".");
const uniq = (arr) => [...new Set(arr)];

const state = { strecke: "", veranstalter: "", tagesart: "", kategorie: "", ansaugung: "serie", wertRoh: "" };
let daten = [];

/* ---------- Ableitungen ---------- */
function eintrag() {
  // undefined = noch nicht vollständig gewählt · null = nicht in der Tabelle · Objekt = Eintrag
  if (!state.strecke) return undefined;
  if (state.veranstalter === FEHLT || state.tagesart === FEHLT) return null;
  if (!state.veranstalter || !state.tagesart) return undefined;
  return daten.find((d) => d.strecke === state.strecke && d.veranstalter === state.veranstalter && d.tagesart === state.tagesart) ?? null;
}
const wertFehler = () => pruefeMesswert(state.wertRoh);
const standwert = () => (state.wertRoh.trim() === "" || wertFehler() ? null : Number(state.wertRoh.replace(",", ".")));
const eingabe = () => ({ kategorie: state.kategorie, ansaugung: state.ansaugung, standwert: standwert() });

/* ---------- Auswahlfelder ---------- */
function fuelle(select, platzhalter, werte, fehltText) {
  select.innerHTML =
    `<option value="">${esc(platzhalter)}</option>` +
    werte.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join("") +
    (fehltText ? `<option value="${FEHLT}">${esc(fehltText)}</option>` : "");
}

function baueTermin() {
  fuelle($("sel-strecke"), "Strecke wählen …", uniq(daten.map((d) => d.strecke)).sort());
  $("sel-strecke").value = state.strecke;

  const vs = uniq(daten.filter((d) => d.strecke === state.strecke).map((d) => d.veranstalter));
  $("f-veranstalter").hidden = !state.strecke;
  fuelle($("sel-veranstalter"), "Veranstalter wählen …", vs, "Anderer Veranstalter");
  $("sel-veranstalter").value = state.veranstalter;

  const ts = daten.filter((d) => d.strecke === state.strecke && d.veranstalter === state.veranstalter).map((d) => d.tagesart);
  $("f-tagesart").hidden = !state.veranstalter || state.veranstalter === FEHLT;
  fuelle($("sel-tagesart"), "Tagesart wählen …", ts, "Andere Tagesart");
  $("sel-tagesart").value = state.tagesart;
}

function baueKategorien() {
  $("kategorien").innerHTML = KATEGORIEN.map(
    (k) => `<label class="chip"><input type="radio" name="kategorie" value="${k.id}"${state.kategorie === k.id ? " checked" : ""}>
      <b>${esc(k.name)}</b><small>${esc(k.info)}</small></label>`
  ).join("");
}

/* ---------- Anzeige: Limits ---------- */
function readout(label, limit, art) {
  if (limit == null) return `<div class="readout"><span class="readout-label">${label}</span><span class="readout-value none">kein Test</span></div>`;
  const streng = istStreng(art, limit);
  return `<div class="readout"><span class="readout-label">${label}</span>
    <span class="readout-value">${dbFmt(limit)}<small>dB(A)</small></span>
    <span class="tag ${streng ? "" : "normal"}">${streng ? "streng" : "normal"}</span></div>`;
}

function messart(e) {
  const teile = [];
  if (e.stand_db != null) teile.push(`Stand ${esc(e.messart_stand || "k. A.")}`);
  if (e.driveby_db != null) teile.push(`Drive-by ${esc(e.messart_driveby || "k. A.")}`);
  return `Messung: ${teile.join(" · ")}`;
}

function zeigeLimits() {
  const e = eintrag();
  const box = $("limits");
  if (e === undefined) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  if (e === null) {
    box.innerHTML = `<div class="unknown-box">Keine Daten für diesen Termin. Wir schätzen nichts.</div>`;
    return;
  }
  box.innerHTML = `<div class="readouts">${readout("Standtest", e.stand_db, "stand")}${readout("Drive-by", e.driveby_db, "driveby")}</div>
    <p class="source">${messart(e)}</p>
    <p class="source">Quelle: <a href="${esc(e.quelle)}" target="_blank" rel="noopener">${esc(e.quelle_label)}</a> · gelesen ${datum(e.gelesen_am)}</p>
    ${e.status === "alt" ? `<p class="warn">⚠ ${esc(e.status_text)}</p>` : ""}`;
}

/* ---------- Anzeige: Ergebnis ---------- */
// Ampel als Plakat: zwei Farbkreise im Überdruck, darunter die Legende mit „warum“
const discNum = (r) => (r.stufe === "unbekannt" ? "?" : r.limit != null ? dbFmt(r.limit) : "–");
const disc = (r) => `<div class="disc" data-stufe="${r.stufe}"><span class="disc-num">${discNum(r)}</span></div>`;

function legende(titel, r) {
  return `<article data-stufe="${r.stufe}">
    <h3>${titel}</h3>
    <b class="stufe">${STUFEN[r.stufe].label}</b>
    <p>${esc(r.warum)}</p>
    ${r.zusatz ? `<p class="zusatz">${esc(r.zusatz)}</p>` : ""}
  </article>`;
}

function zeigeErgebnis() {
  const e = eintrag();
  const ziel = $("ergebnis");
  const bereit = e !== undefined && state.kategorie && !wertFehler();
  if (!bereit) {
    ziel.innerHTML = `<p class="empty">${
      e === undefined ? "Termin und Auspuff wählen."
      : !state.kategorie ? "Noch Auspuff wählen."
      : "Standwert korrigieren oder leer lassen."}</p>`;
    zeigePeek(null);
    return;
  }

  const r = bewerte(e, eingabe());
  const kat = kategorie(state.kategorie);
  const termin = e
    ? `${e.strecke} · ${e.veranstalter} · ${e.tagesart}`
    : `${state.strecke} · ${state.veranstalter === FEHLT ? "anderer Veranstalter" : `${state.veranstalter} · andere Tagesart`}`;
  const auto = `${kat.name}${state.ansaugung === "offen" ? " · Ansaugung offen" : ""} · ${standwert() != null ? `${dbFmt(standwert())} dB` : "ohne Messwert"}`;

  const tipps = uniq([...r.stand.tipps, ...r.driveby.tipps]);
  if (e) {
    tipps.push(...(e.hinweise || []));
    if (e.folge) tipps.push(e.folge);
  }
  if (standwert() == null && e && e.stand_db != null && !["motorsport", "straight"].includes(state.kategorie)) {
    tipps.push("Eigener Standwert = genauer, nur dann Grün.");
  }

  const alts = e ? alternativen(daten, e, eingabe()) : [];

  ziel.innerHTML = `
    <p class="summary"><span><strong>${esc(termin)}</strong></span><button class="linkbtn" data-goto="step-termin">ändern</button></p>
    <p class="summary"><span><strong>${esc(auto)}</strong></span><button class="linkbtn" data-goto="step-auto">ändern</button></p>
    <div class="poster">
      <div class="discs" aria-hidden="true">${disc(r.stand)}${disc(r.driveby)}</div>
      <div class="legend">${legende("Standtest", r.stand)}${legende("Drive-by", r.driveby)}</div>
    </div>
    ${tipps.length ? `<div class="panel"><h3>Tipps</h3><ul>${tipps.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
    ${alts.length ? `<div class="panel"><h3>Weniger Risiko</h3><ul class="alts">${alts.map(({ eintrag: a, ergebnis: ar }) => `
      <li><button class="alt" data-alt="${esc(a.id)}"><span>${esc(a.strecke)} · ${esc(a.veranstalter)}<small>${esc(a.tagesart)} · ${a.stand_db ?? "–"} / ${dbFmt(a.driveby_db ?? "–")} dB</small></span>
        <span class="alt-lamps" aria-label="Standtest ${STUFEN[ar.stand.stufe].label}, Drive-by ${STUFEN[ar.driveby.stufe].label}"><span class="dot ${ar.stand.stufe}"></span><span class="dot ${ar.driveby.stufe}"></span></span></button></li>`).join("")}</ul>
      </div>` : ""}`;
  zeigePeek(r);
}

/* ---------- Schritt-Zustände und Sticky-Hinweis ---------- */
function zeigeSchritte() {
  const terminOk = eintrag() !== undefined;
  const autoOk = !!state.kategorie && !wertFehler();
  $("step-termin").dataset.state = terminOk ? "done" : "active";
  $("step-auto").dataset.state = autoOk ? "done" : terminOk ? "active" : "waiting";
  $("step-ergebnis").dataset.state = terminOk && autoOk ? "active" : "waiting";
}

let ergebnisSichtbar = false;
let letztesErgebnis = null;
function zeigePeek(r) {
  letztesErgebnis = r;
  const peek = $("peek");
  if (!r || ergebnisSichtbar) { peek.hidden = true; return; }
  $("peek-lamps").innerHTML = `<span class="dot ${r.stand.stufe}"></span><span class="dot ${r.driveby.stufe}"></span>`;
  peek.hidden = false;
}

/* ---------- URL (zum Teilen von Szenarien) ---------- */
function schreibeUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ s: state.strecke, v: state.veranstalter, t: state.tagesart, k: state.kategorie, w: state.wertRoh.trim() }))
    if (v) p.set(k, v);
  if (state.ansaugung === "offen") p.set("a", "offen");
  history.replaceState(null, "", p.toString() ? `#${p}` : location.pathname);
}
function leseUrl() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.strecke = p.get("s") || "";
  state.veranstalter = p.get("v") || "";
  state.tagesart = p.get("t") || "";
  state.kategorie = KATEGORIEN.some((k) => k.id === p.get("k")) ? p.get("k") : "";
  state.ansaugung = p.get("a") === "offen" ? "offen" : "serie";
  state.wertRoh = p.get("w") || "";
}

/* ---------- Ablauf ---------- */
function render() {
  baueTermin();
  zeigeLimits();
  const fehler = wertFehler();
  $("in-wert").setAttribute("aria-invalid", fehler ? "true" : "false");
  $("wert-err").textContent = fehler || "";
  zeigeSchritte();
  zeigeErgebnis();
  schreibeUrl();
}

function waehleEintrag(e) {
  Object.assign(state, { strecke: e.strecke, veranstalter: e.veranstalter, tagesart: e.tagesart });
  render();
}

function verbinde() {
  $("sel-strecke").addEventListener("change", (ev) => { Object.assign(state, { strecke: ev.target.value, veranstalter: "", tagesart: "" }); render(); });
  $("sel-veranstalter").addEventListener("change", (ev) => {
    state.veranstalter = ev.target.value;
    state.tagesart = "";
    const ts = daten.filter((d) => d.strecke === state.strecke && d.veranstalter === state.veranstalter);
    if (ts.length === 1) state.tagesart = ts[0].tagesart; // nur eine Tagesart → direkt übernehmen
    render();
  });
  $("sel-tagesart").addEventListener("change", (ev) => { state.tagesart = ev.target.value; render(); });
  $("kategorien").addEventListener("change", (ev) => { state.kategorie = ev.target.value; render(); });
  document.querySelectorAll('input[name="ansaugung"]').forEach((i) => i.addEventListener("change", (ev) => { state.ansaugung = ev.target.value; render(); }));
  $("in-wert").addEventListener("input", (ev) => {
    state.wertRoh = ev.target.value;
    // Fehler erst beim Verlassen zeigen, Ergebnis aber sofort aktualisieren, wenn gültig
    const fehler = wertFehler();
    if (!fehler) $("wert-err").textContent = "";
    $("in-wert").setAttribute("aria-invalid", "false");
    zeigeSchritte(); zeigeErgebnis(); schreibeUrl();
  });
  $("in-wert").addEventListener("blur", render);
  $("ergebnis").addEventListener("click", (ev) => {
    const ziel = ev.target.closest("[data-goto]");
    if (ziel) { $(ziel.dataset.goto).scrollIntoView({ block: "start" }); return; }
    const alt = ev.target.closest("[data-alt]");
    if (alt) { waehleEintrag(daten.find((d) => d.id === alt.dataset.alt)); $("step-ergebnis").scrollIntoView({ block: "start" }); }
  });
  new IntersectionObserver(([en]) => { ergebnisSichtbar = en.isIntersecting; zeigePeek(letztesErgebnis); }, { threshold: 0 })
    .observe($("step-ergebnis"));
}

/* ---------- Hell / Dunkel ---------- */
const dunkelSystem = matchMedia("(prefers-color-scheme: dark)");
const themaJetzt = () => document.documentElement.dataset.theme || (dunkelSystem.matches ? "dark" : "light");
function zeigeThema() {
  const t = themaJetzt();
  $("theme").textContent = t === "dark" ? "Hell" : "Dunkel";
  $("theme").setAttribute("aria-label", t === "dark" ? "Helles Design" : "Dunkles Design");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = t === "dark" ? "#151412" : "#f2ece0"; });
}
function verbindeThema() {
  $("theme").addEventListener("click", () => {
    const neu = themaJetzt() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = neu;
    try { localStorage.setItem("theme", neu); } catch {}
    zeigeThema();
  });
  dunkelSystem.addEventListener("change", zeigeThema);
  zeigeThema();
}

async function start() {
  verbindeThema();
  try {
    const res = await fetch("data/strecken.json?v=6");
    if (!res.ok) throw new Error(res.status);
    daten = await res.json();
  } catch (err) {
    $("ergebnis").innerHTML = `<p class="empty">Daten nicht geladen – Seite neu laden.</p>`;
    return;
  }
  leseUrl();
  $("in-wert").value = state.wertRoh;
  document.querySelector(`input[name="ansaugung"][value="${state.ansaugung}"]`).checked = true;
  baueKategorien();
  verbinde();
  render();
}
start();
