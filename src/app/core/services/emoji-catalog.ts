import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { EmojibaseCompactEntry, EmojiItem, OpenMojiEmoji } from '../models/emoji.models';

@Injectable({ providedIn: 'root' })
export class EmojiCatalogService {
  private openMojiCache?: OpenMojiEmoji[];
  private emojibaseCache?: Map<string, string>;

  async loadOpenMoji(): Promise<OpenMojiEmoji[]> {
    if (this.openMojiCache) return this.openMojiCache;
    const res = await fetch(environment.openMojiJsonUrl);
    if (!res.ok) throw new Error(`OpenMoji JSON fetch failed: ${res.status}`);
    const json = await res.json();
    this.openMojiCache = Array.isArray(json) ? json : [];
    return this.openMojiCache;
  }

  async loadEmojibaseFr(): Promise<Map<string, string>> {
    if (this.emojibaseCache) return this.emojibaseCache;

    const res = await fetch(environment.emojibaseFrUrl);
    if (!res.ok) throw new Error(`Emojibase FR fetch failed: ${res.status}`);

    const arr = (await res.json()) as EmojibaseCompactEntry[];
    const map = new Map<string, string>();

    for (const e of arr ?? []) {
      const label = (e?.label ?? e?.annotation ?? '').trim();
      if (!label) continue;

      const hex = (e?.hexcode ?? '').trim().toUpperCase();
      if (hex) map.set(hex, label);

      const uni = (e?.unicode ?? e?.emoji ?? '').trim();
      if (uni) {
        map.set(uni, label);
        // bonus: enlève VS16 (FE0F) pour matcher plus souvent
        map.set(uni.replace(/\uFE0F/g, ''), label);
      }
    }

    this.emojibaseCache = map;
    return map;
  }

  async buildItems(opts: { includeExtrasUnicode: boolean; enableEmojibaseFr: boolean; }): Promise<EmojiItem[]> {
    const [openmoji, frMap] = await Promise.all([
      this.loadOpenMoji(),
      opts.enableEmojibaseFr ? this.loadEmojibaseFr() : Promise.resolve(new Map<string, string>()),
    ]);

    const items: EmojiItem[] = [];

    for (const e of openmoji) {
      const group = (e.group ?? 'Autres').trim() || 'Autres';
      const subgroup = (Array.isArray(e.subgroups) && e.subgroups[0] ? String(e.subgroups[0]) : 'Divers').trim() || 'Divers';

      const isExtras = group.toLowerCase().includes('extras');
      if (!opts.includeExtrasUnicode && isExtras) continue;

      const hex = (e.hexcode ?? '').toUpperCase();
      const emojiChar = e.emoji;

      const emojiNoVS16 = emojiChar ? emojiChar.replace(/\uFE0F/g, '') : undefined;

      const frLabel = opts.enableEmojibaseFr
        ? (frMap.get(hex) ??
          (emojiChar ? frMap.get(emojiChar) : undefined) ??
          (emojiNoVS16 ? frMap.get(emojiNoVS16) : undefined))
        : undefined;

      items.push({
        hexcode: hex,
        emojiChar,
        svgUrl: `${environment.openMojiSvgBaseUrl}${hex}.svg`,
        group,
        subgroup,
        tags: [...(e.tags ?? [])].map(String),

        labelOpenMoji: e.annotation ?? '',
        labelFrAuto: frLabel,
        labelOverride: undefined,
        labelResolved: '',

        isSelected: false,
        isExtrasUnicode: isExtras,
      });
    }

    return items;
  }
}
