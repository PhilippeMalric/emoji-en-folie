export interface OpenMojiEmoji {
  hexcode: string;
  annotation: string;
  group?: string;
  subgroups?: string[];
  tags?: string[];
  emoji?: string; // selon le JSON
}
export interface EmojibaseCompactEntry {
  hexcode?: string;     // "1F384" ou "1F1E8-1F1E6"
  unicode?: string;     // "🎄" (peut contenir FE0F)
  label?: string;       // libellé localisé (FR)
  // compat si tu switches sur data.json ou une vieille version:
  annotation?: string;
  emoji?: string;
  tags?: string[];
}

export interface EmojiItem {
  hexcode: string;
  emojiChar?: string;
  svgUrl: string;

  group: string;
  subgroup: string;
  tags: string[];

  labelOpenMoji: string;
  labelFrAuto?: string;
  labelOverride?: string;
  labelResolved: string;

  isSelected: boolean;
  isExtrasUnicode: boolean;
}

