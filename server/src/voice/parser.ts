import { collapse, hasTamil, similarity, titleCase, transliterateTamil } from './text.js';

/**
 * Rule-based parser that turns a spoken/typed purchase request in English, Tamil or Tanglish
 * into structured task fields. It never creates anything itself — the caller shows the
 * result for confirmation. Kept behind the `PurchaseParser` interface so an LLM-backed
 * parser can replace it later without touching the API.
 */

export interface NamedEntity {
  id: number;
  name: string;
}

export interface ParseContext {
  sections: NamedEntity[];
  users: NamedEntity[];
  /** Known item names (e.g. recent task titles) used to clean up the detected item. */
  items?: string[];
  /** ISO date (yyyy-mm-dd) considered "today". */
  today: string;
}

export type Priority = 'normal' | 'high' | 'urgent';

export interface ParsedPurchase {
  transcript: string;
  title: string | null;
  quantity: number | null;
  unit: string;
  section: NamedEntity | null;
  assignee: NamedEntity | null;
  priority: Priority;
  dueDate: string | null;
  /** Words that looked like a section/person but did not match any known one. */
  unmatched: { section?: string; person?: string };
  /** Required fields that could not be detected. */
  missing: Array<'title' | 'quantity' | 'section' | 'assignee'>;
  /** True when title and quantity were both found — still requires user confirmation. */
  confident: boolean;
}

export interface PurchaseParser {
  parse(transcript: string, ctx: ParseContext): ParsedPurchase;
}

// ---------------------------------------------------------------------------
// Vocabulary. Written in natural spelling; every key is normalised with collapse()
// at load time because tokens are compared in collapsed form.
// ---------------------------------------------------------------------------

const words = (...list: string[]) => new Set(list.map(collapse));
function table<T>(obj: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj)) out[collapse(k)] = v;
  return out;
}

/** Common Tamil-script words, mapped before transliteration. */
const TAMIL_WORDS: Array<[RegExp, string]> = [
  [/^(ஒன்று|ஒண்ணு|ஒரு|ஓர்)/, '1'],
  [/^(இரண்டு|ரெண்டு|இரெண்டு)/, '2'],
  [/^(மூன்று|மூணு)/, '3'],
  [/^(நான்கு|நாலு)/, '4'],
  [/^(ஐந்து|அஞ்சு)/, '5'],
  [/^ஆறு/, '6'],
  [/^ஏழு/, '7'],
  [/^எட்டு/, '8'],
  [/^ஒன்பது/, '9'],
  [/^பத்து/, '10'],
  [/^இருபது/, '20'],
  [/^முப்பது/, '30'],
  [/^ஐம்பது/, '50'],
  [/^நூறு/, '100'],
  [/^(வேணும்|வேண்டும்|வேணு|வேண்டு)/, 'venum'],
  [/^(அவசரம்|அவசரமா|அவசர)/, 'urgent'],
  [/^(முக்கியம்|முக்கியமா)/, 'important'],
  [/^(இன்னைக்கு|இன்றைக்கு|இன்று|இன்னிக்கு)/, 'today'],
  [/^(நாளைக்கு|நாளை)/, 'tomorrow'],
  [/^(நாளன்னைக்கு|நாளன்னிக்கு)/, 'dayaftertomorrow'],
  [/^(பண்ணுங்க|பண்ணு|பண்ணவும்|பண்ணனும்)/, 'pannunga'],
  [/^(வாங்குங்க|வாங்கணும்|வாங்கவும்|வாங்கு)/, 'vangunga'],
  [/^(கொடுங்க|குடுங்க|கொடு)/, 'kudunga'],
];

const NUMBER_WORDS = table<number>({
  one: 1, on: 1, onu: 1, oru: 1, or: 1,
  two: 2, rendu: 2, irandu: 2, erandu: 2, iranda: 2,
  thre: 3, three: 3, munu: 3, mundru: 3, mondru: 3,
  four: 4, nalu: 4, nangu: 4,
  five: 5, anju: 5, ainthu: 5, aindhu: 5,
  six: 6, aru: 6,
  seven: 7, ezhu: 7, elu: 7,
  eight: 8, etu: 8,
  nine: 9, onbathu: 9, onpathu: 9,
  ten: 10, pathu: 10, patu: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, iruvathu: 20, irupathu: 20,
  thirty: 30, forty: 40, fifty: 50, ambathu: 50, aimbathu: 50, hundred: 100, nuru: 100,
  half: 0.5, arai: 0.5,
  // spoken single-letter confusions
  to: 2, too: 2, for: 4,
});
// "to"/"for"/"on"/"or" are only numbers when directly followed by a unit or item; handled below.
const AMBIGUOUS_NUMBER_WORDS = words('to', 'too', 'for', 'on', 'or');

const UNITS = table<string>({
  no: 'Nos', nos: 'Nos', number: 'Nos', numbers: 'Nos', nombers: 'Nos', piece: 'Nos', pieces: 'Nos',
  pc: 'Nos', pcs: 'Nos', unit: 'Nos', units: 'Nos', qty: 'Nos',
  m: 'M', mtr: 'M', mtrs: 'M', meter: 'M', meters: 'M', metre: 'M', metres: 'M', miter: 'M', mitar: 'M',
  kg: 'Kg', kgs: 'Kg', kilo: 'Kg', kilos: 'Kg', kilogram: 'Kg', kilograms: 'Kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'L', ltr: 'L', ltrs: 'L', liter: 'L', liters: 'L', litre: 'L', litres: 'L',
  ml: 'ml',
  packet: 'Packets', packets: 'Packets', paket: 'Packets', pakets: 'Packets', pkt: 'Packets', pkts: 'Packets', pack: 'Packets', packs: 'Packets',
  box: 'Box', boxes: 'Box', set: 'Set', sets: 'Set', roll: 'Roll', rols: 'Roll', rolls: 'Roll',
  pair: 'Pair', pairs: 'Pair', bottle: 'Bottle', bottles: 'Bottle', botle: 'Bottle', can: 'Can', cans: 'Can',
  bag: 'Bag', bags: 'Bag', ream: 'Ream', reams: 'Ream', dozen: 'Dozen', bundle: 'Bundle', bundles: 'Bundle',
  feet: 'Ft', ft: 'Ft', foot: 'Ft', sheet: 'Sheet', sheets: 'Sheet', tin: 'Tin', tins: 'Tin', drum: 'Drum', drums: 'Drum',
  kitu: 'Nos', item: 'Nos', items: 'Nos',
});

const URGENT_WORDS = words(
  'urgent', 'urgently', 'urgenta', 'urgentah', 'urgentana', 'arjent', 'arjenta', 'arjentaa', 'avasaram', 'avasarama',
  'asap', 'emergency', 'immediately', 'immediate', 'udane', 'udanadiya',
);
const HIGH_WORDS = words('high', 'important', 'mukkiyam', 'mukkiyama', 'quickly', 'quick', 'sekiram', 'sikiram', 'seekiram', 'fast', 'soon');

const DATE_WORDS = table<number>({
  today: 0, inaiku: 0, iniku: 0, indru: 0, inaikku: 0, inike: 0, tonight: 0,
  tomorow: 1, tomorrow: 1, tmrw: 1, nalaiku: 1, nalaiki: 1, nalai: 1, naalaiku: 1,
  dayaftertomorrow: 2, nalanniku: 2, nalannaiku: 2,
});

/** Words that carry no item information. */
const FILLERS = words(
  // English
  'please', 'pls', 'plz', 'kindly', 'required', 'require', 'requires', 'requirement', 'need', 'needs', 'needed',
  'want', 'wants', 'wanted', 'purchase', 'purchased', 'buy', 'order', 'get', 'bring', 'procure', 'arange', 'arrange',
  'the', 'a', 'an', 'for', 'to', 'of', 'and', 'from', 'by', 'in', 'is', 'are', 'be', 'it', 'this', 'that', 'we', 'i',
  'us', 'our', 'my', 'some', 'sir', 'madam', 'ok', 'okay', 'hi', 'hello', 'also', 'with', 'at', 'on', 'department',
  'dept', 'section', 'team', 'section', 'assign', 'asign', 'asigned', 'assigned', 'give', 'handover', 'task', 'create',
  'priority', 'due', 'by', 'before', 'item', 'items', 'quantity', 'qty', 'material', 'materials', 'do', 'make', 'send',
  'asain', 'asainment',
  // Tanglish / transliterated Tamil
  'venum', 'vendum', 'venu', 'vendu', 'veenum', 'veentum', 'venumnu', 'vaenum', 'pannunga', 'panunga', 'pannu', 'panu',
  'pannanum', 'pananum', 'pannavum', 'panavum', 'panungal', 'vangunga', 'vanganum', 'vangavum', 'vangu', 'vanunga',
  'vaankunka', 'kudunga', 'kodunga', 'kodu', 'podunga', 'podu', 'konjam', 'ithu', 'itha', 'athu', 'atha', 'oru', 'ku',
  'ku', 'la', 'le', 'il', 'ah', 'aa', 'nu', 'nga', 'kita', 'kitta', 'ta', 'kum', 'um', 'thevai', 'tevai', 'thevaipadukirathu',
  'irukku', 'iruku', 'vaanga', 'vanga', 'sollunga', 'solunga', 'pannidunga', 'panidunga', 'yeduthu', 'eduthu', 'enaku',
  'namaku', 'nammaku', 'romba', 'rompa', 'very', 'so', 'much', 'more', 'than', 'ana', 'aana', 'mattum', 'can', 'you',
  'could', 'will', 'should', 'needful', 'there', 'here', 'now',
);

/** Tanglish case suffixes that may be glued to a name: "maintenanceku", "ashokku", "stationeryla". */
const SUFFIXES = [...new Set(['ukku', 'kku', 'ku', 'ukitta', 'kitta', 'la', 'le', 'il', 'ile', 'oda', 'ah', 'aa', 'um', 'ta', 'u'].map(collapse))];

const ASSIGN_MARKERS = words('assign', 'assigned', 'assignment', 'asain', 'give', 'handover', 'kitta');
const PERSON_PREPOSITIONS = words('to', 'by');

// ---------------------------------------------------------------------------

interface Token {
  raw: string;
  norm: string; // collapse()d
  used: boolean;
}

function normaliseTamilToken(token: string): string {
  for (const [re, replacement] of TAMIL_WORDS) {
    if (re.test(token)) {
      const rest = token.replace(re, '');
      return rest ? `${replacement} ${transliterateTamil(rest)}` : replacement;
    }
  }
  return transliterateTamil(token);
}

function tokenize(text: string): Token[] {
  const words = text
    .replace(/[,.;:!?()"'“”‘’]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (hasTamil(w) ? normaliseTamilToken(w).split(/\s+/) : [w]))
    .flatMap((w) => w.split(/(?<=[a-zA-Z]{2,})-(?=[a-zA-Z])/)) // "maintenance-ku" → "maintenance", "ku"; keep "v-belt"
    .flatMap((w) => {
      // "10m", "5kg", "2nos" → number + unit (but keep "A4", "M10")
      const m = /^(\d+(?:\.\d+)?)([a-zA-Z]+)$/.exec(w);
      if (m && UNITS[collapse(m[2])]) return [m[1], m[2]];
      return [w];
    });
  return words.map((raw) => ({ raw, norm: collapse(raw), used: false }));
}

function stripSuffix(norm: string): string[] {
  const out = [norm];
  for (const s of SUFFIXES) {
    if (norm.length > s.length + 2 && norm.endsWith(s)) out.push(norm.slice(0, -s.length));
  }
  return out;
}

interface EntityMatch {
  entity: NamedEntity;
  start: number;
  length: number;
  score: number;
}

/** Finds the best entity mention over 1–3 token windows, tolerating glued Tanglish suffixes. */
function findEntity(tokens: Token[], entities: NamedEntity[], threshold: number, allowFirstName: boolean): EntityMatch | null {
  let best: EntityMatch | null = null;
  const names = entities.flatMap((e) => {
    const variants = [{ e, name: e.name }];
    if (allowFirstName) {
      const first = e.name.split(/\s+/)[0];
      if (first && first !== e.name) variants.push({ e, name: first });
    }
    return variants;
  });

  for (let start = 0; start < tokens.length; start++) {
    for (let len = 1; len <= 3 && start + len <= tokens.length; len++) {
      const window = tokens.slice(start, start + len);
      if (window.some((t) => t.used)) break;
      const joined = window.map((t) => t.norm).join('');
      if (!joined || /^\d+$/.test(joined)) continue;
      if (joined.length < 3) {
        // Short names such as "IT" only match exactly, and only when clearly used as a name
        // (spoken in capitals or followed by a case marker) so "purchase it" is not a section.
        const next = tokens[start + len]?.norm;
        const clearlyName = window[0].raw === window[0].raw.toUpperCase() || ['ku', 'la', 'le', 'section', 'department', 'dept'].includes(next ?? '');
        const exact = names.find(({ name }) => collapse(name) === joined);
        if (len === 1 && clearlyName && exact && (!best || best.score < 1)) {
          best = { entity: exact.e, start, length: 1, score: 1 };
        }
        continue;
      }
      for (const candidate of stripSuffix(joined)) {
        for (const { e, name } of names) {
          const score = similarity(candidate, name) - (len - 1) * 0.01; // prefer shorter spans on ties
          if (score >= threshold && (!best || score > best.score)) {
            best = { entity: e, start, length: len, score };
          }
        }
      }
    }
  }
  return best;
}

function parseNumber(token: Token, next: Token | undefined): number | null {
  if (/^\d+(\.\d+)?$/.test(token.raw)) return Number(token.raw);
  const n = NUMBER_WORDS[token.norm];
  if (n === undefined) return null;
  if (AMBIGUOUS_NUMBER_WORDS.has(token.norm)) {
    // "to"/"for" only count when followed by a unit ("for kg") — otherwise they're prepositions.
    if (!next || !UNITS[next.norm]) return null;
  }
  return n;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function matchItem(title: string, items: string[]): string {
  let best = { name: title, score: 0 };
  for (const item of items) {
    const score = similarity(title, item);
    if (score > best.score) best = { name: item, score };
  }
  return best.score >= 0.84 ? best.name : title;
}

export const ruleBasedParser: PurchaseParser = {
  parse(transcript, ctx) {
    const tokens = tokenize(transcript.trim());
    const unmatched: ParsedPurchase['unmatched'] = {};

    // 1. Person: prefer a name next to an assign marker, then any person mention.
    let assignee: NamedEntity | null = null;
    const person = findEntity(tokens, ctx.users, 0.8, true);
    if (person) {
      assignee = person.entity;
      for (let i = person.start; i < person.start + person.length; i++) tokens[i].used = true;
    } else {
      // "assign to X" / "X-ku assign" where X is unknown: remember it so the UI can tell the user.
      const markerIdx = tokens.findIndex((t) => ASSIGN_MARKERS.has(t.norm));
      if (markerIdx >= 0) {
        const after = tokens.slice(markerIdx + 1).find((t) => !PERSON_PREPOSITIONS.has(t.norm) && !FILLERS.has(t.norm));
        const before = [...tokens.slice(0, markerIdx)].reverse().find((t) => !['ku', 'kku', 'ta', 'kita', 'kitta'].includes(t.norm));
        const guess = tokens[markerIdx].norm.startsWith('kit') ? before : (after ?? before);
        if (guess && !UNITS[guess.norm] && !NUMBER_WORDS[guess.norm]) {
          unmatched.person = guess.raw.replace(/-?(kku|ku)$/i, '');
          guess.used = true;
        }
      }
    }

    // 2. Section.
    const sectionMatch = findEntity(tokens, ctx.sections, 0.8, false);
    const section = sectionMatch?.entity ?? null;
    if (sectionMatch) {
      for (let i = sectionMatch.start; i < sectionMatch.start + sectionMatch.length; i++) tokens[i].used = true;
    } else {
      // "<word>-ku"/"<word> la" at the start of a sentence usually names a section.
      const idx = tokens.findIndex((t, i) => i < tokens.length - 1 && ['ku', 'kku', 'la', 'le'].includes(tokens[i + 1].norm) && !t.used);
      if (idx >= 0 && idx <= 1 && !NUMBER_WORDS[tokens[idx].norm] && !/^\d/.test(tokens[idx].raw)) {
        unmatched.section = titleCase(tokens[idx].raw);
        tokens[idx].used = true;
      }
    }

    // 3. Priority and due date.
    let priority: Priority = 'normal';
    let dueDate: string | null = null;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.used) continue;
      const variants = stripSuffix(t.norm);
      if (variants.some((v) => URGENT_WORDS.has(v))) {
        priority = 'urgent';
        t.used = true;
      } else if (variants.some((v) => HIGH_WORDS.has(v))) {
        if (priority !== 'urgent') priority = 'high';
        t.used = true;
      }
      const joined3 = tokens.slice(i, i + 3).map((x) => x.norm).join('');
      if (joined3 === 'dayaftertomorow') {
        dueDate = addDays(ctx.today, 2);
        tokens.slice(i, i + 3).forEach((x) => (x.used = true));
      } else {
        const d = variants.map((v) => DATE_WORDS[v]).find((v) => v !== undefined);
        if (d !== undefined) {
          dueDate = addDays(ctx.today, d);
          t.used = true;
        }
      }
    }

    // 4. Quantity + unit. Prefer a number followed by a unit.
    let quantity: number | null = null;
    let unit = 'Nos';
    const numberCandidates: Array<{ i: number; value: number; hasUnit: boolean }> = [];
    tokens.forEach((t, i) => {
      if (t.used) return;
      const value = parseNumber(t, tokens[i + 1]);
      if (value !== null && value > 0) numberCandidates.push({ i, value, hasUnit: !!UNITS[tokens[i + 1]?.norm ?? ''] });
    });
    const chosen = numberCandidates.find((c) => c.hasUnit) ?? numberCandidates[0];
    if (chosen) {
      quantity = chosen.value;
      tokens[chosen.i].used = true;
      if (chosen.hasUnit) {
        unit = UNITS[tokens[chosen.i + 1].norm];
        tokens[chosen.i + 1].used = true;
      }
    }

    // 5. Item title: whatever meaningful words remain.
    const itemWords = tokens
      .filter((t) => !t.used && t.norm && !FILLERS.has(t.norm) && !stripSuffix(t.norm).slice(1).some((v) => FILLERS.has(v) && v.length > 3))
      .map((t) => t.raw.replace(/-(ku|kku|la|le|ah|aa)$/i, ''));
    let title: string | null = itemWords.length ? titleCase(itemWords.join(' ')) : null;
    if (title && ctx.items?.length) title = matchItem(title, ctx.items);
    if (title && title.length > 200) title = title.slice(0, 200);

    const missing: ParsedPurchase['missing'] = [];
    if (!title) missing.push('title');
    if (quantity === null) missing.push('quantity');
    if (!section) missing.push('section');
    if (!assignee) missing.push('assignee');

    return {
      transcript,
      title,
      quantity,
      unit,
      section,
      assignee,
      priority,
      dueDate,
      unmatched,
      missing,
      confident: !!title && quantity !== null,
    };
  },
};
