/**
 * Каталог форматов заданий — часть инструкций для ИИ (перенесено из Morskoy, lib/exercise-formats.js).
 *
 * Задание в игре — это три вещи:
 *   text    – короткая инструкция по-русски (в Question — instruction);
 *   display – немецкий материал задания: предложение, диалог, части (в Question — prompt);
 *   options – четыре варианта.
 *
 * Варианты-предложения панель вопроса ставит столбиком во всю ширину, поэтому ЦЕЛЫЕ
 * ПРЕДЛОЖЕНИЯ в вариантах технически не проблема. На этом и держится каталог: задание должно
 * требовать настоящего грамматического решения, а не клика по одному служебному слову.
 * Тексты совпадают с Morskoy дословно.
 */

export type FormatId =
  | 'satzvarianten'
  | 'umformung'
  | 'verbindung'
  | 'fehlerkorrektur'
  | 'dialog'
  | 'mehrfachluecke'
  | 'wortstellung'
  | 'bedeutung'
  | 'luecke';

export interface FormatExample {
  topic: string;
  level: string;
  text: string;
  display: string;
  options: string[];
  correct: number;
  why: string;
}

export interface ExerciseFormat {
  name: string;
  instruction: string;
  display: string;
  options: string;
  useFor: string;
  example: FormatExample;
}

export const EXERCISE_FORMATS: Record<FormatId, ExerciseFormat> = {
  satzvarianten: {
    name: 'Satzvarianten (Vollsatz-Auswahl)',
    instruction: 'Выбери грамматически правильный вариант.',
    display:
      'Eine Situation in einem Satz, dazu in Klammern das Wortmaterial (Verben, Stichwörter), aus dem der Satz gebaut werden soll.',
    options:
      'Vier VOLLSTÄNDIGE deutsche Sätze mit identischem Wortmaterial. Sie unterscheiden sich ausschließlich im Zielphänomen (Form, Position, Klammer).',
    useFor:
      'Satzbau, Satzklammer, Infinitiv mit zu, Nebensätze, Verbstellung, trennbare Verben, Passiv, Konjunktiv.',
    example: {
      topic: 'Infinitiv mit zu',
      level: 'B1',
      text: 'Выбери грамматически правильный вариант.',
      display: 'Sein Zug fährt um sechs. (vorhaben – früh aufstehen)',
      options: [
        'Er hat vor, morgen früh aufzustehen.',
        'Er hat vor, morgen früh zu aufstehen.',
        'Er hat vor, morgen früh aufstehen zu.',
        'Er hat vor, morgen früh aufstehen.',
      ],
      correct: 0,
      why: 'Alle vier Optionen sind vollständige Sätze mit demselben Wortmaterial. Geprüft wird nur die Stellung von "zu" beim trennbaren Verb. Niemand kann die Lösung an der Optionslänge oder an einem Nebenfehler ablesen.',
    },
  },

  umformung: {
    name: 'Umformung (Transformation)',
    instruction: 'Преобразуй предложение по заданию.',
    display:
      'Ein korrekter Ausgangssatz in Form A und eine PRÄZISE Angabe der Zielform ("ins Passiv Präsens", "ins Präteritum", "als indirekte Frage").',
    options: 'Vier vollständige Sätze in Form B.',
    useFor:
      'Passiv, Präteritum, Perfekt, Plusquamperfekt, Konjunktiv II, Konjunktiv I, indirekte Fragen, Relativsätze, Nominalisierung.',
    example: {
      topic: 'Passiv',
      level: 'B1',
      text: 'Преобразуй предложение по заданию.',
      display: 'Ins Passiv Präsens umformen: "Der Mechaniker repariert das Auto."',
      options: [
        'Das Auto wird vom Mechaniker repariert.',
        'Das Auto wird von dem Mechaniker reparieren.',
        'Das Auto ist vom Mechaniker repariert.',
        'Das Auto wurde vom Mechaniker repariert.',
      ],
      correct: 0,
      why: 'Option 3 (Zustandspassiv) und Option 4 (Präteritum) sind für sich genommen wohlgeformte Sätze — die Anweisung "Passiv Präsens" schließt sie eindeutig aus. Das ist erlaubt und stark, WEIL die Zielform exakt benannt ist.',
    },
  },

  verbindung: {
    name: 'Satzverbindung',
    instruction: 'Соедини два предложения в одно.',
    display:
      'Zwei korrekte Einzelsätze, dazu das geforderte Verbindungsmittel (Konjunktion, Relativsatz, Doppelkonjunktion).',
    options: 'Vier vollständige zusammengesetzte Sätze.',
    useFor:
      'Relativsätze, weil/dass/obwohl/wenn, als vs. wenn, Doppelkonjunktionen, indirekte Fragen, Infinitivsätze.',
    example: {
      topic: 'Relativsätze',
      level: 'B1',
      text: 'Соедини два предложения в одно.',
      display:
        'Verbinde mit einem Relativsatz: "Der Turm ist sehr alt." + "Man kann den Turm vom Bahnhof aus sehen."',
      options: [
        'Der Turm, den man vom Bahnhof aus sehen kann, ist sehr alt.',
        'Der Turm, der man vom Bahnhof aus sehen kann, ist sehr alt.',
        'Der Turm, dem man vom Bahnhof aus sehen kann, ist sehr alt.',
        'Der Turm, den man kann vom Bahnhof aus sehen, ist sehr alt.',
      ],
      correct: 0,
      why: 'Der Lernende muss den Kasus aus der Funktion im Relativsatz ableiten (Akkusativ) UND die Verbstellung halten. Drei verschiedene, real belegte Fehler als Distraktoren.',
    },
  },

  fehlerkorrektur: {
    name: 'Fehlerkorrektur',
    instruction: 'В предложении одна ошибка. Выбери исправленный вариант.',
    display: 'Ein Satz mit GENAU EINEM Fehler, der zum Thema gehört.',
    options:
      'Vier vollständige Sätze: einer ist korrigiert, einer wiederholt den unveränderten Fehlersatz, zwei "korrigieren" falsch.',
    useFor: 'Alle Themen, besonders Wortstellung, Kasus, Verbformen, Negation.',
    example: {
      topic: 'Wortstellung im Nebensatz',
      level: 'A2',
      text: 'В предложении одна ошибка. Выбери исправленный вариант.',
      display: 'Ich bleibe heute zu Hause, weil ich habe Fieber.',
      options: [
        'Ich bleibe heute zu Hause, weil ich Fieber habe.',
        'Ich bleibe heute zu Hause, weil habe ich Fieber.',
        'Ich bleibe heute zu Hause, weil ich habe Fieber.',
        'Ich bleibe heute zu Hause, denn ich Fieber habe.',
      ],
      correct: 0,
      why: 'Option 3 ist der unveränderte Fehlersatz — ein starker Distraktor für Lernende, die den Fehler nicht sehen. Option 4 prüft zusätzlich die Abgrenzung weil/denn, bleibt aber im Thema Wortstellung.',
    },
  },

  dialog: {
    name: 'Minidialog / Kontextentscheidung',
    instruction: 'Прочитай ситуацию и выбери подходящий вариант.',
    display:
      'Zwei bis drei Zeilen Dialog oder eine kurze Situation. Die Lücke steht in der Antwort. NUR der Kontext entscheidet — die Form allein reicht nicht.',
    options: 'Vier Varianten, die alle grammatisch möglich wären; nur eine passt zur Situation.',
    useFor:
      'Modalverben (Bedeutung), als vs. wenn, Perfekt gegen Präteritum, Artikel (bestimmt/unbestimmt), Negation und doch, Konjunktiv II, Wechselpräpositionen.',
    example: {
      topic: 'Modalverben',
      level: 'A2',
      text: 'Прочитай ситуацию и выбери подходящий вариант.',
      display:
        '— Muss ich das Formular heute abgeben? — Nein, du ___ es nicht heute abgeben. Du hast noch bis Freitag Zeit.',
      options: ['musst', 'darfst', 'sollst', 'kannst'],
      correct: 0,
      why: 'Hier sind Einwortoptionen richtig, weil das Zielphänomen tatsächlich EIN Wort ist: die Bedeutung des Modalverbs. Die Entscheidung trägt der Kontext ("noch bis Freitag Zeit" = keine Notwendigkeit, nicht Verbot). "darfst" wäre ein Verbot — der klassische Fehler.',
    },
  },

  mehrfachluecke: {
    name: 'Mehrfachlücke / Kombinationsmatrix',
    instruction: 'Заполни оба пропуска.',
    display: 'Ein Satz mit zwei (selten drei) nummerierten Lücken, die grammatisch zusammenhängen.',
    options:
      'Jede Option liefert den KOMPLETTEN Satz von Einsetzungen, getrennt durch " – ". Am besten als 2×2-Matrix: zwei Entscheidungen, vier Kombinationen.',
    useFor:
      'Perfekt (Hilfsverb + Partizip), Adjektivdeklination, Kasus bei zwei Objekten, Reflexivpronomen + Artikel, Relativpronomen + Verbstellung, Modalverben im Präteritum.',
    example: {
      topic: 'Perfekt',
      level: 'A2',
      text: 'Заполни оба пропуска.',
      display: 'Gestern (1) ___ meine Schwester mit dem Zug nach Hamburg (2) ___ .',
      options: ['ist – gefahren', 'hat – gefahren', 'ist – gefahrt', 'hat – gefahrt'],
      correct: 0,
      why: 'Eine saubere 2×2-Matrix: Achse 1 ist die Hilfsverbwahl, Achse 2 die Partizipbildung. Raten bringt 25 Prozent, halbes Wissen bringt 50 Prozent — beides ist sichtbar. Kein Distraktor scheitert an etwas Themenfremdem.',
    },
  },

  wortstellung: {
    name: 'Satzbau aus Bausteinen',
    instruction: 'Составь предложение из данных частей.',
    display:
      'Die Satzglieder durch " / " getrennt in ZUFÄLLIGER Reihenfolge — niemals schon in der richtigen.',
    options: 'Vier vollständige Sätze aus genau diesen Bausteinen.',
    useFor:
      'Wortstellung im Haupt- und Nebensatz, Satzklammer, TeKaMoLo, trennbare Verben, Negationsposition.',
    example: {
      topic: 'Wortstellung im Hauptsatz',
      level: 'A2',
      text: 'Составь предложение из данных частей.',
      display: 'ins Kino / heute Abend / mit meiner Schwester / ich / gehe',
      options: [
        'Heute Abend gehe ich mit meiner Schwester ins Kino.',
        'Heute Abend ich gehe mit meiner Schwester ins Kino.',
        'Heute Abend ich mit meiner Schwester ins Kino gehe.',
        'Gehe ich heute Abend mit meiner Schwester ins Kino.',
      ],
      correct: 0,
      why: 'Achtung: "Ich gehe heute Abend mit meiner Schwester ins Kino." wäre EBENFALLS korrekt und darf deshalb NICHT als falsche Option auftauchen. Die Distraktoren verletzen alle die Verbzweitstellung.',
    },
  },

  bedeutung: {
    name: 'Bedeutungsunterscheidung (Minimalpaar)',
    instruction: 'Выбери вариант, который подходит по смыслу.',
    display: 'Eine Situation, die eindeutig eine von zwei ähnlichen Strukturen verlangt.',
    options:
      'Vier Varianten, von denen mehrere für sich genommen wohlgeformt sind; nur eine trifft die beschriebene Situation.',
    useFor:
      'Wechselpräpositionen (wohin/wo), nicht dürfen gegen nicht müssen, Vorgangs- gegen Zustandspassiv, Perfekt gegen Plusquamperfekt, lassen, Konjunktiv II, Reflexivpronomen im Dativ gegen Akkusativ.',
    example: {
      topic: 'Wechselpräpositionen',
      level: 'A2',
      text: 'Выбери вариант, который подходит по смыслу.',
      display: '— Wo ist meine Brille? — Du hast sie doch selbst ___ gelegt!',
      options: ['auf den Tisch', 'auf dem Tisch', 'auf der Tisch', 'auf die Tische'],
      correct: 0,
      why: 'Das Verb "legen" erzwingt die Richtung und damit den Akkusativ. Option 2 ist die Positionsvariante (der häufigste Fehler), Option 3 eine falsche Artikelform, Option 4 der falsche Numerus.',
    },
  },

  luecke: {
    name: 'Lückensatz mit vollständiger Zielstruktur',
    instruction: 'Выбери правильный вариант.',
    display:
      'Ein deutscher Satz mit genau einer Lücke ___ . Der Satz muss genug Kontext liefern, damit nur eine Form passt.',
    options:
      'Vier Varianten, die JEWEILS DIE GANZE Zielstruktur enthalten — nicht nur ein Füllwort daraus.',
    useFor: 'Kasus, Adjektivdeklination, Verbformen, Präpositionen, Pronomen.',
    example: {
      topic: 'Dativ',
      level: 'A2',
      text: 'Выбери правильный вариант.',
      display: 'Zum Geburtstag hat Anna ___ einen großen Blumenstrauß geschenkt.',
      options: [
        'ihrer neuen Kollegin',
        'ihre neue Kollegin',
        'ihrer neue Kollegin',
        'ihren neuen Kollegen',
      ],
      correct: 0,
      why: 'Die Lücke umfasst die ganze Nominalphrase (Possessivartikel + Adjektiv + Nomen), nicht nur den Artikel. Damit wird die Dativentscheidung wirklich geprüft und nicht bloß ein Wort erkannt.',
    },
  },
};

/** Форматы для слота «Wortstellung»: они работают с целыми предложениями. */
export const WORTSTELLUNG_FORMATS: readonly FormatId[] = [
  'wortstellung',
  'satzvarianten',
  'fehlerkorrektur',
  'verbindung',
];

export function isFormatId(id: unknown): id is FormatId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXERCISE_FORMATS, id);
}

/** Формат как блок промпта, с разобранным примером. */
export function renderFormat(id: string): string {
  if (!isFormatId(id)) return '';
  const format = EXERCISE_FORMATS[id];
  const example = format.example;

  const optionLines = example.options
    .map(
      (option, index) =>
        `   ${'ABCD'[index]}) ${option}${index === example.correct ? '   <- richtig' : ''}`,
    )
    .join('\n');

  return [
    `FORMAT "${id}" — ${format.name}`,
    `  Anweisung (text): ${format.instruction}`,
    `  Aufgabenmaterial (display): ${format.display}`,
    `  Optionen: ${format.options}`,
    `  Geeignet für: ${format.useFor}`,
    `  Beispiel (${example.topic}, ${example.level}):`,
    `   text: ${example.text}`,
    `   display: ${example.display}`,
    optionLines,
    `   Warum das eine gute Aufgabe ist: ${example.why}`,
  ].join('\n');
}

/** Каталог форматов, разрешённых для темы. */
export function renderFormatCatalogue(ids: readonly string[]): string {
  const list = (Array.isArray(ids) ? ids : []).filter(isFormatId);
  if (!list.length) return '';

  return [
    'AUFGABENFORMATE — verwende NUR diese und halte dich genau an ihren Aufbau:',
    '',
    list.map(renderFormat).join('\n\n'),
  ].join('\n');
}
