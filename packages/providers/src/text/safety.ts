import { PROMPT_MAX_CODEPOINTS } from '@loopscene/contracts';

/**
 * Input pre-check (SEC-07 / AI-03 / design doc §28).
 *
 * Deliberately narrow. It blocks the categories our supplier terms and the
 * launch scope actually forbid — named artists/songs, quoted lyrics, voice
 * imitation, reference-media URLs — and rewrites the request into mood /
 * instrument / tempo language.
 *
 * Two things it is NOT:
 *   - a copyright determination. A block means "outside what we accept",
 *     never "you attempted something illegal" (SEC-07 requires the UI to say
 *     so, and every result carries `appealable: true`);
 *   - a guarantee. Passing this check does not make output non-infringing.
 */
export type BlockReason =
  | 'too_long'
  | 'artist_or_title_reference'
  | 'lyrics_or_vocal_request'
  | 'voice_imitation'
  | 'reference_media_url'
  | 'personal_information'
  | 'prompt_injection';

export interface SafetyResult {
  allowed: boolean;
  reason: BlockReason | null;
  /** Japanese guidance shown to the user, phrased as a rewrite suggestion. */
  hintKey: string | null;
  /** Every block can be contested; nothing here is an automatic permanent ban. */
  appealable: boolean;
}

const ALLOW: SafetyResult = { allowed: true, reason: null, hintKey: null, appealable: false };

function block(reason: BlockReason, hintKey: string): SafetyResult {
  return { allowed: false, reason, hintKey, appealable: true };
}

/** "〜風", "〜っぽい", "like <name>" combined with a proper-noun-looking token. */
const STYLE_OF_PATTERNS: RegExp[] = [
  /[「『"][^」』"]{2,40}[」』"]\s*(風|っぽい|みたいな|のような|の曲|そっくり)/,
  /\b(like|in the style of|sounds? like|cover of|remix of)\s+[A-Z][\w.'-]+/i,
  /(の|と)(そっくり|同じ曲|カバー|替え歌)/,
];

/** Vocal / lyric requests — out of scope for the instrumental launch (§1.2). */
const VOCAL_PATTERNS: RegExp[] = [
  /(歌詞|作詞|ボーカル|ヴォーカル|歌って|歌入り|コーラス|ラップ|替え歌|主旋律の歌)/,
  /\b(lyrics?|vocals?|sing(ing)?|rap|chorus vocal|topline)\b/i,
];

/** Voice / person imitation and implied endorsement. */
const VOICE_PATTERNS: RegExp[] = [
  /(声|ボイス)(を)?(真似|まね|模倣|コピー|クローン)/,
  /\b(voice\s*(clone|clon|imitat|impersonat))/i,
  /(公認|オフィシャル|本人)(の)?(声|歌声)/,
];

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;

/** Rough PII screens; keeps card numbers and addresses out of the model call (SEC-12). */
const PII_PATTERNS: RegExp[] = [
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{3,4}\b/, // card-shaped
  /[\w.+-]+@[\w-]+\.[\w.]{2,}/, // email
  /\b\d{3}-?\d{4}\b\s*[都道府県市区町村]/, // JP postal + address
];

/** Attempts to reframe the untrusted text as an instruction to the system. */
const INJECTION_PATTERNS: RegExp[] = [
  /(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instructions?|rules?|prompts?)/i,
  /(system\s*prompt|developer\s*message|上記の指示を無視)/i,
  /\b(you are now|act as|jailbreak|DAN mode)\b/i,
];

export function checkPrompt(prompt: string): SafetyResult {
  const text = prompt.trim();
  if (!text) return ALLOW;

  if ([...text].length > PROMPT_MAX_CODEPOINTS) {
    return block('too_long', 'prompt.tooLong');
  }
  if (URL_PATTERN.test(text)) {
    // SEC-05: we never accept a reference-music URL, and the server never
    // fetches a user-supplied address.
    return block('reference_media_url', 'prompt.noUrl');
  }
  for (const p of PII_PATTERNS) {
    if (p.test(text)) return block('personal_information', 'prompt.noPersonalInfo');
  }
  for (const p of INJECTION_PATTERNS) {
    if (p.test(text)) return block('prompt_injection', 'prompt.rewriteAsMood');
  }
  for (const p of VOICE_PATTERNS) {
    if (p.test(text)) return block('voice_imitation', 'prompt.noVoiceImitation');
  }
  for (const p of VOCAL_PATTERNS) {
    if (p.test(text)) return block('lyrics_or_vocal_request', 'prompt.instrumentalOnly');
  }
  for (const p of STYLE_OF_PATTERNS) {
    if (p.test(text)) return block('artist_or_title_reference', 'prompt.noArtistOrTitle');
  }
  return ALLOW;
}

/**
 * Redacts a prompt for logs. SEC-06: prompts and personal data are never
 * written to application logs in the clear.
 */
export function redactPrompt(prompt: string): string {
  const cp = [...prompt];
  if (cp.length <= 8) return `[redacted ${cp.length}cp]`;
  return `${cp.slice(0, 4).join('')}…[redacted ${cp.length}cp]`;
}
