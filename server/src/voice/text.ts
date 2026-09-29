/**
 * Text helpers for matching spoken Tamil / English / Tanglish against known names.
 * Speech engines return English loanwords either in Latin script ("bearing") or in
 * Tamil script ("பேரிங்"), so both are reduced to a comparable phonetic form.
 */

const VOWELS: Record<string, string> = {
  'அ': 'a', 'ஆ': 'aa', 'இ': 'i', 'ஈ': 'ii', 'உ': 'u', 'ஊ': 'uu',
  'எ': 'e', 'ஏ': 'ee', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'oo', 'ஔ': 'au',
};

const CONSONANTS: Record<string, string> = {
  'க': 'k', 'ங': 'ng', 'ச': 's', 'ஞ': 'nj', 'ட': 't', 'ண': 'n', 'த': 'th', 'ந': 'n',
  'ப': 'p', 'ம': 'm', 'ய': 'y', 'ர': 'r', 'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l',
  'ற': 'r', 'ன': 'n', 'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h',
};

const VOWEL_SIGNS: Record<string, string> = {
  'ா': 'aa', 'ி': 'i', 'ீ': 'ii', 'ு': 'u', 'ூ': 'uu', 'ெ': 'e', 'ே': 'ee', 'ை': 'ai',
  'ொ': 'o', 'ோ': 'oo', 'ௌ': 'au',
};

const VIRAMA = '்';

export const hasTamil = (s: string) => /[஀-௿]/.test(s);

/** Simple Tamil → Latin transliteration, good enough for phonetic matching. */
export function transliterateTamil(input: string): string {
  let out = '';
  const chars = [...input];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (VOWELS[ch]) {
      out += VOWELS[ch];
    } else if (CONSONANTS[ch]) {
      const next = chars[i + 1];
      if (next === VIRAMA) {
        out += CONSONANTS[ch];
        i++;
      } else if (next && VOWEL_SIGNS[next]) {
        out += CONSONANTS[ch] + VOWEL_SIGNS[next];
        i++;
      } else {
        out += CONSONANTS[ch] + 'a';
      }
    } else if (VOWEL_SIGNS[ch] || ch === VIRAMA || ch === 'ஃ') {
      // stray sign — ignore
    } else if (/[௦-௯]/.test(ch)) {
      out += String(ch.charCodeAt(0) - 0x0be6); // Tamil digits
    } else {
      out += ch;
    }
  }
  return out;
}

/** Lowercase, drop punctuation, collapse doubled letters and long vowels. */
export function collapse(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1');
}

/**
 * Consonant skeleton with voiced/unvoiced pairs merged, e.g.
 * "maintenance" and "meyintanans" → "mntnns"; "Ashok" and "asook" → "ask".
 */
export function skeleton(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  w = w
    .replace(/ph/g, 'f')
    .replace(/sh|ch|zh/g, (m) => (m === 'zh' ? 'l' : 's'))
    .replace(/th/g, 't')
    .replace(/ng/g, 'nk')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/[cq]/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/b/g, 'p')
    .replace(/d/g, 't')
    .replace(/g/g, 'k')
    .replace(/j/g, 's')
    .replace(/z/g, 's')
    .replace(/w/g, 'v')
    .replace(/f/g, 'p');
  const first = w[0] ?? '';
  const rest = w.slice(1).replace(/[aeiouyh]/g, '');
  return (/[aeiou]/.test(first) ? 'a' : first) + rest.replace(/(.)\1+/g, '$1');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity score in [0, 1] between a spoken phrase and a known name. */
export function similarity(spoken: string, known: string): number {
  const a = collapse(spoken);
  const b = collapse(known);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const sa = skeleton(spoken);
  const sb = skeleton(known);
  const skeletonMatch = sa.length >= 3 && sa === sb ? 0.86 : 0;
  return Math.max(ratio, skeletonMatch);
}

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/\d/.test(w)) return w.toUpperCase(); // A4, M10
      if (w.length === 1) return w.toUpperCase();
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(' ');
}
