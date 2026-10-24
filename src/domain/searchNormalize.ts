/**
 * Food search normalization. The SAME function is used:
 * - by the food import script to build `food_master.search_text`
 * - by the app to normalize the user's query
 * so that ひらがな/カタカナ and 全角/半角 variations match.
 *
 * Steps: NFKC (full/half width, half-width kana) → lowercase → katakana→hiragana
 * → remove whitespace and common punctuation used in 成分表 names (［］（）・、 etc.).
 */

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const KANA_OFFSET = 0x60;

export function katakanaToHiragana(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out +=
      code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KANA_OFFSET)
        : ch;
  }
  return out;
}

const STRIP_RE = /[\s　・･、，,。.\-‐－―()（）[\]［］{}｛｝<>＜＞「」『』【】〔〕"'“”‘’/／:：;；]/g;

export function normalizeForSearch(text: string): string {
  return katakanaToHiragana(text.normalize('NFKC').toLowerCase()).replace(STRIP_RE, '');
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
