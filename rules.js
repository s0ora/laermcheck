// Ampel-Regel v1 (bestätigt 17.11.2026) – feste Regeln, keine KI.
// Siehe Vault: Bauplan/Ampel-Regel v1 – Lärmcheck.md

export const KATEGORIEN = [
  { id: "serie", name: "Serie", info: "Original-Auspuff ohne Klappe", klappe: false },
  { id: "serie_klappe", name: "Serie mit Klappe", info: "Werks-Sportauspuff, schaltbar (z. B. Porsche PSE)", klappe: true },
  { id: "sport_klappe", name: "Sport-Nachrüstung mit Klappe", info: "Zubehör-Anlage mit Klappe", klappe: true },
  { id: "sport", name: "Sport-Nachrüstung ohne Klappe", info: "Zubehör-Anlage, immer offen", klappe: false },
  { id: "motorsport", name: "Motorsport", info: "Ohne Straßenzulassung", klappe: false },
  { id: "straight", name: "Straight Pipe / Decat", info: "Ohne Endtopf oder Katalysator", klappe: false },
];

export const STRENG_AB = { stand: 101, driveby: 98 }; // Limit <= Wert gilt als streng
export const ABSTAND_GRUEN = 7; // dB, berichtete Schwankung 92 -> 99 dB (D1, S6)
export const MESSWERT_MIN = 60;
export const MESSWERT_MAX = 135;

// [normal, streng] ohne eigenen Messwert – nie Grün
const MATRIX = {
  serie: ["gelb", "gelb"],
  serie_klappe: ["gelb", "gelb"],
  sport_klappe: ["gelb", "rot"],
  sport: ["gelb", "rot"],
  motorsport: ["rot", "rot"],
  straight: ["rot", "rot"],
};

export const STUFEN = {
  gruen: { label: "Geringes Risiko", rang: 0 },
  gelb: { label: "Risiko – vorbereiten", rang: 1 },
  rot: { label: "Hohes Risiko", rang: 2 },
  unbekannt: { label: "Unbekannt", rang: null },
  keiner: { label: "Kein Test", rang: null },
};

const fmt = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");

export function kategorie(id) {
  return KATEGORIEN.find((k) => k.id === id) || null;
}

export function istStreng(art, limit) {
  return limit != null && limit <= STRENG_AB[art];
}

/** Prüft den optionalen Standwert. Gibt eine Fehlermeldung oder null zurück. */
export function pruefeMesswert(roh) {
  if (roh === "" || roh == null) return null;
  const n = Number(String(roh).replace(",", "."));
  if (!Number.isFinite(n)) return "Bitte eine Zahl eingeben, z. B. 99.";
  if (n < MESSWERT_MIN || n > MESSWERT_MAX)
    return `Ein Standwert liegt normalerweise zwischen ${MESSWERT_MIN} und ${MESSWERT_MAX} dB.`;
  return null;
}

function warumOhneWert(kat, art, streng) {
  switch (kat) {
    case "serie":
      return art === "stand"
        ? "Serienautos bestehen meist, aber nicht immer (Beispiel: 991 S mit 110 dB bei Limit 105). Trag einen Messwert ein."
        : "Serienautos bestehen meist, aber nicht immer – ohne Messung bleibt ein Risiko.";
    case "serie_klappe":
      return "Mit geschlossener Klappe bestehen Autos dieser Art meist. Ohne Messwert bleibt ein Risiko.";
    case "sport_klappe":
    case "sport":
      return streng
        ? "Dieser Tag hat ein strenges Limit. Mit Sportauspuff fallen hier Autos öfter durch."
        : "Ein Sportauspuff liegt oft nah am Limit. Ohne Messwert ist das nicht sicher einzuschätzen.";
    default:
      return "Ohne Schalldämpfung liegen Werte meist deutlich über Trackday-Limits.";
  }
}

function bewerteMessart(art, eintrag, eingabe) {
  if (!eintrag) {
    return { stufe: "unbekannt", warum: "Für diesen Termin haben wir keine Daten – frag beim Veranstalter nach.", tipps: [] };
  }
  const limit = art === "stand" ? eintrag.stand_db : eintrag.driveby_db;
  if (limit == null) {
    return {
      stufe: "keiner",
      limit: null,
      warum: art === "stand" ? "Kein Standtest an diesem Tag – gemessen wird nur beim Vorbeifahren." : "Kein Drive-by-Limit an diesem Tag.",
      tipps: [],
    };
  }
  const kat = kategorie(eingabe.kategorie);
  const streng = istStreng(art, limit);
  const tipps = [];
  if (kat?.klappe) tipps.push("Klappe beim Test und auf der Strecke geschlossen lassen.");

  // Regel 1: eigener Standwert
  if (art === "stand" && eingabe.standwert != null) {
    const diff = limit - eingabe.standwert;
    let stufe, warum;
    if (diff >= ABSTAND_GRUEN) {
      stufe = "gruen";
      warum = `Dein Standwert liegt ${fmt(diff)} dB unter dem Limit – mehr als die berichtete Schwankung von ${ABSTAND_GRUEN} dB.`;
    } else if (diff >= 0) {
      stufe = "gelb";
      warum = diff === 0
        ? `Dein Standwert liegt genau am Limit. Werte schwanken um bis zu ${ABSTAND_GRUEN} dB.`
        : `Dein Standwert liegt nur ${fmt(diff)} dB unter dem Limit. Werte schwanken um bis zu ${ABSTAND_GRUEN} dB.`;
    } else {
      stufe = "rot";
      warum = `Dein Standwert liegt ${fmt(-diff)} dB über dem Limit.`;
    }
    return { stufe, limit, streng, warum, zusatz: null, tipps, mitMesswert: true };
  }

  // Regel 2: Kategorie × Strenge
  let stufe = MATRIX[eingabe.kategorie][streng ? 1 : 0];
  let zusatz = null;
  // Regel 3: offene Ansaugung eine Stufe schlechter
  if (eingabe.ansaugung === "offen") {
    if (stufe === "gelb") stufe = "rot";
    zusatz = "Eine offene Ansaugung macht das Auto zusätzlich lauter (Annahme).";
  }
  if (art === "driveby" && stufe !== "gruen" && !["motorsport", "straight"].includes(eingabe.kategorie)) {
    tipps.push("Vor den Messpunkten früh hochschalten und nicht voll beschleunigen – so berichten es Fahrer.");
  }
  return { stufe, limit, streng, warum: warumOhneWert(eingabe.kategorie, art, streng), zusatz, tipps, mitMesswert: false };
}

/** Bewertet einen Eintrag der Streckentabelle (oder null = unbekannt). */
export function bewerte(eintrag, eingabe) {
  return { stand: bewerteMessart("stand", eintrag, eingabe), driveby: bewerteMessart("driveby", eintrag, eingabe) };
}

/** Höchster Risiko-Rang der beiden Messarten (Kein Test zählt nicht). */
export function gesamtRang(ergebnis) {
  const r = [ergebnis.stand, ergebnis.driveby].map((x) => STUFEN[x.stufe].rang).filter((x) => x != null);
  return r.length ? Math.max(...r) : null;
}

/** Andere Einträge, die für dieselbe Eingabe ein geringeres Risiko ergeben. */
export function alternativen(daten, aktuell, eingabe, max = 3) {
  const jetzt = gesamtRang(bewerte(aktuell, eingabe));
  if (jetzt == null || jetzt === 0) return [];
  return daten
    .filter((e) => e.id !== aktuell.id)
    .map((e) => ({ eintrag: e, ergebnis: bewerte(e, eingabe) }))
    .map((x) => ({ ...x, rang: gesamtRang(x.ergebnis) }))
    .filter((x) => x.rang != null && x.rang < jetzt)
    .sort((a, b) => a.rang - b.rang || a.eintrag.strecke.localeCompare(b.eintrag.strecke))
    .slice(0, max);
}
