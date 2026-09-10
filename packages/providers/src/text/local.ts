import { FIXED_DURATION_SECONDS, type Mood, type Scene, type TempoHint } from '@loopscene/contracts';
import type { IntentRequest, IntentResult, TextProvider } from './types.js';

/**
 * Deterministic local intent extractor for demo mode and tests.
 *
 * It is a keyword mapper, not a language model: it exists so the whole
 * generation pipeline can run without TokenStars credentials. Its provider id
 * is recorded on every job, so nothing produced through it can be mistaken for
 * evidence that the real text model was called (§12.2).
 */
export class LocalTextProvider implements TextProvider {
  readonly providerId = 'local-rules';
  readonly model = 'keyword-map-v1';

  private static readonly MOOD_HINTS: Array<[RegExp, Mood]> = [
    [/(静か|しずか|落ち着|穏やか|calm|chill)/i, 'calm'],
    [/(夢|ドリーム|ふわ|dreamy|ethereal)/i, 'dreamy'],
    [/(あたたか|温か|ほっこり|warm|cozy)/i, 'warm'],
    [/(切な|寂し|さみし|哀|melanchol|sad)/i, 'melancholic'],
    [/(かっこ|クール|自信|confident|cool)/i, 'confident'],
    [/(楽し|かわい|ポップ|playful|fun|happy)/i, 'playful'],
    [/(緊張|シリアス|tense|dark|intense)/i, 'tense'],
    [/(前向き|元気|明る|uplift|bright)/i, 'uplifting'],
  ];

  private static readonly SCENE_DEFAULTS: Record<string, { mood: Mood; tempo: TempoHint; instruments: string[] }> = {
    night_walk: { mood: 'calm', tempo: 'slow', instruments: ['synth_pad', 'soft_drums', 'sub_bass'] },
    daily_log: { mood: 'warm', tempo: 'medium', instruments: ['electric_piano', 'brushed_drums', 'bass'] },
    outfit: { mood: 'confident', tempo: 'medium', instruments: ['synth_bass', 'claps', 'pluck'] },
    gaming: { mood: 'tense', tempo: 'fast', instruments: ['arp_synth', 'drum_machine', 'saw_bass'] },
  };

  async extractIntent(req: IntentRequest): Promise<IntentResult> {
    const defaults =
      LocalTextProvider.SCENE_DEFAULTS[req.scene] ?? LocalTextProvider.SCENE_DEFAULTS['daily_log']!;

    let mood = defaults.mood;
    for (const [pattern, m] of LocalTextProvider.MOOD_HINTS) {
      if (pattern.test(req.prompt)) {
        mood = m;
        break;
      }
    }

    const tempo: TempoHint = req.energy >= 0.7 ? 'fast' : req.energy <= 0.33 ? 'slow' : defaults.tempo;

    // Fault-injection markers are carried through verbatim so the demo music
    // provider can act on them. This exists only in the demo adapter pair, and
    // lets the GEN-* failure tests exercise the real worker path rather than a
    // test-only branch inside it. A marker is never part of a normal brief.
    const marker = /__FAULT_[A-Z]+__/.exec(req.prompt)?.[0] ?? '';

    return {
      status: 'ok',
      requestId: null,
      repaired: false,
      usage: { costMinor: 0, costIsEstimate: true },
      intent: {
        scene: req.scene as Scene,
        mood,
        energy: req.energy,
        tempoHint: tempo,
        instruments: defaults.instruments,
        durationSeconds: FIXED_DURATION_SECONDS,
        vocalMode: 'instrumental',
        brief:
          `${mood} instrumental for a ${req.scene.replace('_', ' ')} short video, ` +
          `${tempo} tempo, ${defaults.instruments.join(', ')}, no vocals${marker ? ` ${marker}` : ''}`,
      },
    };
  }
}
