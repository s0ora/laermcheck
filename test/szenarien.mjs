// Funktionscheck: Testszenarien aus dem Vault (Bauplan/Tests – Lärmcheck.md, T2).
// Ausführen: node test/szenarien.mjs
import { readFileSync } from "node:fs";
import { bewerte, alternativen, pruefeMesswert } from "../rules.js";

const daten = JSON.parse(readFileSync(new URL("../data/strecken.json", import.meta.url)));
const e = (id) => daten.find((x) => x.id === id);

let fehler = 0;
function pruefe(name, ist, soll) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "✓" : "✗"} ${name}: ${JSON.stringify(ist)}${ok ? "" : `  (erwartet ${JSON.stringify(soll)})`}`);
}
const st = (r) => [r.stand.stufe, r.driveby.stufe];

const A = bewerte(e("bedford-evo"), { kategorie: "serie_klappe", ansaugung: "serie", standwert: null });
pruefe("A Bedford evo, Serie mit Klappe", st(A), ["gelb", "gelb"]);
pruefe("A Tipp Klappe zu", A.stand.tipps[0]?.startsWith("Klappe"), true);

const B = bewerte(e("goodwood-cat2"), { kategorie: "sport", ansaugung: "serie", standwert: 97 });
pruefe("B Goodwood Cat 2, Sport ohne Klappe, Standwert 97", st(B), ["gruen", "gelb"]);
pruefe("B warum nennt 8 dB", B.stand.warum.includes("8 dB"), true);

const eC = { kategorie: "sport_klappe", ansaugung: "serie", standwert: null };
pruefe("C Oulton MSV, Sport mit Klappe", st(bewerte(e("oulton-msv"), eC)), ["gelb", "rot"]);
pruefe("C Alternativen", alternativen(daten, e("oulton-msv"), eC).map((x) => x.eintrag.id), ["goodwood-cat2", "goodwood-evo"]);

const D = bewerte(e("donington-evo"), { kategorie: "serie", ansaugung: "serie", standwert: null });
pruefe("D Donington evo, Serie", st(D), ["keiner", "gelb"]);

const E = bewerte(null, { kategorie: "serie", ansaugung: "serie", standwert: null });
pruefe("E unbekannter Termin", st(E), ["unbekannt", "unbekannt"]);

const eF = { kategorie: "sport_klappe", ansaugung: "offen", standwert: null };
pruefe("F Oulton MSV, Sport mit Klappe, Ansaugung offen", st(bewerte(e("oulton-msv"), eF)), ["rot", "rot"]);
pruefe("F keine besseren Alternativen", alternativen(daten, e("oulton-msv"), eF).length, 0);

// Kriterium 4: nirgends "du bestehst"
const alle = [];
for (const d of [...daten, null])
  for (const kategorie of ["serie", "serie_klappe", "sport_klappe", "sport", "motorsport", "straight"])
    for (const ansaugung of ["serie", "offen"])
      for (const standwert of [null, 90, 99, 110]) {
        const r = bewerte(d, { kategorie, ansaugung, standwert });
        alle.push(r.stand.warum, r.driveby.warum, r.stand.zusatz, r.driveby.zusatz);
        if (!d) break;
      }
pruefe("Kein Text verspricht Bestehen", alle.filter((t) => t && /bestehst|bestanden|garantiert/i.test(t)).length, 0);
pruefe("Jede Ampel hat ein warum", alle.filter((t, i) => i % 4 < 2 && !t).length, 0);

// Eingabeprüfung
pruefe("Messwert leer ok", pruefeMesswert(""), null);
pruefe("Messwert 99,5 ok", pruefeMesswert("99,5"), null);
pruefe("Messwert 12 abgelehnt", pruefeMesswert("12") !== null, true);
pruefe("Messwert abc abgelehnt", pruefeMesswert("abc") !== null, true);

// Kriterium 1: jede Zeile hat Quelle, Lesedatum und ein Messart-Feld; alle 5 Strecken vorhanden
pruefe("Kriterium 1: 5 Strecken in der Tabelle", new Set(daten.map((x) => x.strecke)).size, 5);
pruefe("Kriterium 1: Zeilen ohne Quelle/Datum/Messart-Feld",
  daten.filter((x) => !x.quelle || !x.quelle_label || !x.gelesen_am || !("messart_stand" in x) || !("messart_driveby" in x)).map((x) => x.id), []);

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fehler ? 1 : 0);
