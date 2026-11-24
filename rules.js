// Ampel-Regel v1 (bestätigt 17.11.2026) – feste Regeln, keine KI.
// Siehe Vault: Bauplan/Ampel-Regel v1 – Lärmcheck.md

export const KATEGORIEN = [
  { id: "serie", name: "Serie", info: "Original-Auspuff ohne Klappe", klappe: false },
  { id: "serie_klappe", name: "Serie mit Klappe", info: "Werks-Sportauspuff, schaltbar (z. B. PSE)", klappe: true },
  { id: "sport_klappe", name: "Sport-Nachrüstung mit Klappe", info: "Zubehör, mit Klappe", klappe: true },
  { id: "sport", name: "Sport-Nachrüstung ohne Klappe", info: "Zubehör, ohne Klappe", klappe: false },
  { id: "motorsport", name: "Motorsport", info: "Ohne Straßenzulassung", klappe: false },
  { id: "straight", name: "Straight Pipe / Decat", info: "Ohne Endtopf oder Kat", klappe: false },
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
  gelb: { label: "Mittleres Risiko", rang: 1 },
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
  if (!Number.isFinite(n)) return "Bitte eine Zahl eingeben.";
  if (n < MESSWERT_MIN || n > MESSWERT_MAX)
    return `Üblich sind ${MESSWERT_MIN}–${MESSWERT_MAX} dB.`;
  return null;
}

function warumOhneWert(kat, art, streng) {
  switch (kat) {
    case "serie":
      return art === "stand"
        ? "Serie ist meist unkritisch, aber nicht immer (991 S: 110 dB bei Limit 105)."
        : "Serie ist meist unkritisch, aber nicht immer.";
    case "serie_klappe":
      return "Mit geschlossener Klappe meist unkritisch.";
    case "sport_klappe":
    case "sport":
      return streng
        ? "Strenges Limit – Sportauspuffe fallen hier öfter durch."
        : "Sportauspuffe liegen oft nah am Limit.";
    default:
      return "Ohne Dämpfung meist deutlich über dem Limit.";
  }
}

function bewerteMessart(art, eintrag, eingabe) {
  if (!eintrag) {
    return { stufe: "unbekannt", warum: "Keine Daten – beim Veranstalter erfragen.", tipps: [] };
  }
  const limit = art === "stand" ? eintrag.stand_db : eintrag.driveby_db;
  if (limit == null) {
    return {
      stufe: "keiner",
      limit: null,
      warum: art === "stand" ? "Kein Standtest an diesem Tag." : "Kein Drive-by an diesem Tag.",
      tipps: [],
    };
  }
  const kat = kategorie(eingabe.kategorie);
  const streng = istStreng(art, limit);
  const tipps = [];
  if (kat?.klappe) tipps.push("Klappe zu – beim Test und auf der Strecke.");

  // Regel 1: eigener Standwert
  if (art === "stand" && eingabe.standwert != null) {
    const diff = limit - eingabe.standwert;
    let stufe, warum;
    if (diff >= ABSTAND_GRUEN) {
      stufe = "gruen";
      warum = `${fmt(diff)} dB unter dem Limit – mehr als die übliche Schwankung (${ABSTAND_GRUEN} dB).`;
    } else if (diff >= 0) {
      stufe = "gelb";
      warum = diff === 0
        ? `Genau am Limit – Werte schwanken bis ${ABSTAND_GRUEN} dB.`
        : `Nur ${fmt(diff)} dB unter dem Limit – Werte schwanken bis ${ABSTAND_GRUEN} dB.`;
    } else {
      stufe = "rot";
      warum = `${fmt(-diff)} dB über dem Limit.`;
    }
    return { stufe, limit, streng, warum, zusatz: null, tipps, mitMesswert: true };
  }

  // Regel 2: Kategorie × Strenge
  let stufe = MATRIX[eingabe.kategorie][streng ? 1 : 0];
  let zusatz = null;
  // Regel 3: offene Ansaugung eine Stufe schlechter
  if (eingabe.ansaugung === "offen") {
    if (stufe === "gelb") stufe = "rot";
    zusatz = "Offene Ansaugung: lauter (Annahme).";
  }
  if (art === "driveby" && stufe !== "gruen" && !["motorsport", "straight"].includes(eingabe.kategorie)) {
    tipps.push("An den Messpunkten früh hochschalten (Fahrerberichte).");
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
