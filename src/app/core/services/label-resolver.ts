import { Injectable } from '@angular/core';
import type { EmojiItem } from '../models/emoji.models';

@Injectable({ providedIn: 'root' })
export class LabelResolverService {
  private readonly displayNamesFr = new Intl.DisplayNames('fr', { type: 'region' });

  resolve(item: EmojiItem, opts: { enableEmojibaseFr: boolean; enableFlagIntl: boolean; }): string {
    const raw =
      (item.labelOverride && item.labelOverride.trim()) ||
      (opts.enableEmojibaseFr && item.labelFrAuto?.trim()) ||
      (opts.enableFlagIntl ? this.flagLabelIfAny(item) : '') ||
      (item.labelOpenMoji?.trim()) ||
      '';

    return this.formatLabel(raw, item);
  }

  private formatLabel(input: string, item: EmojiItem): string {
    let s = input.trim();

    // guillemets doubles -> simples
    s = s.replace(/["“”]/g, "'");

    // cas drapeaux: enlever préfixes
    s = s.replace(/^(flag|drapeau)\s*[:\-–—]\s*/i, '');

    // Trim encore
    s = s.trim();

    if (!s) return '';

    // Première lettre majuscule
    s = s[0].toUpperCase() + s.slice(1);

    return s;
  }

  private flagLabelIfAny(item: EmojiItem): string {
    // Hexcode du style "1F1E8-1F1E6" (Canada)
    const parts = item.hexcode.split('-');
    if (parts.length !== 2) return '';
    const cps = parts.map(p => parseInt(p, 16));
    if (cps.some(cp => !(cp >= 0x1F1E6 && cp <= 0x1F1FF))) return '';

    const cc = cps
      .map(cp => String.fromCharCode(0x41 + (cp - 0x1F1E6)))
      .join('');

    try {
      return this.displayNamesFr.of(cc) || '';
    } catch {
      return '';
    }
  }
}
