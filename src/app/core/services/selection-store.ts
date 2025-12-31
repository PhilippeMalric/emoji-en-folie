import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { EmojiItem } from '../models/emoji.models';
import { LabelResolverService } from './label-resolver';

type PersistV1 = {
  v: 1;
  toggles: {
    includeExtrasUnicode: boolean;
    enableEmojibaseFr: boolean;
    enableFlagIntl: boolean;
  };
  selectedHexes: string[];
  overrides: Record<string, string>; // HEX -> label
};

const LS_KEY = 'emoji-en-folie:persist:v1';

@Injectable({ providedIn: 'root' })
export class SelectionStoreService {
  private readonly resolver = inject(LabelResolverService);

  // UI state
  readonly query = signal('');
  readonly groupFilter = signal<string>('Tous');

  // feature toggles
  readonly includeExtrasUnicode = signal(false);
  readonly enableEmojibaseFr = signal(true);
  readonly enableFlagIntl = signal(true);

  // persisted maps
  private readonly _selectedHexes = signal<string[]>([]);
  private readonly _overrides = signal<Record<string, string>>({});

  // catalog items
  private readonly _items = signal<EmojiItem[]>([]);
  readonly activeHexcode = signal<string | null>(null);

  // items with resolved labels
  readonly items = computed(() => {
    const sel = new Set(this._selectedHexes().map(h => h.toUpperCase()));
    const ov = this._overrides();
    const opts = {
      enableEmojibaseFr: this.enableEmojibaseFr(),
      enableFlagIntl: this.enableFlagIntl(),
    };

    return this._items().map(i => {
      const hex = i.hexcode.toUpperCase();
      const labelOverride = ov[hex] ?? i.labelOverride ?? '';
      const patched: EmojiItem = {
        ...i,
        hexcode: hex,
        isSelected: sel.has(hex),
        labelOverride,
        labelResolved: this.resolver.resolve(
          { ...i, hexcode: hex, labelOverride },
          opts
        ),
      };
      return patched;
    });
  });

  readonly selected = computed(() => this.items().filter(x => x.isSelected));

  readonly groups = computed(() => {
    const set = new Set(this.items().map(i => i.group));
    return ['Tous', ...Array.from(set).sort()];
  });

  constructor() {
    this.loadFromStorage();

    effect(() => {
      const payload: PersistV1 = {
        v: 1,
        toggles: {
          includeExtrasUnicode: this.includeExtrasUnicode(),
          enableEmojibaseFr: this.enableEmojibaseFr(),
          enableFlagIntl: this.enableFlagIntl(),
        },
        selectedHexes: this._selectedHexes(),
        overrides: this._overrides(),
      };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    });
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as PersistV1;
      if (!p || p.v !== 1) return;

      this.includeExtrasUnicode.set(!!p.toggles?.includeExtrasUnicode);
      this.enableEmojibaseFr.set(!!p.toggles?.enableEmojibaseFr);
      this.enableFlagIntl.set(!!p.toggles?.enableFlagIntl);

      this._selectedHexes.set((p.selectedHexes ?? []).map(s => String(s).toUpperCase()));
      this._overrides.set(p.overrides ?? {});
    } catch {
      // ignore
    }
  }

  setItems(items: EmojiItem[]) {
    this._items.set(items.map(i => ({ ...i, hexcode: i.hexcode.toUpperCase() })));
    if (!this.activeHexcode() && this._selectedHexes().length) {
      this.activeHexcode.set(this._selectedHexes()[0]);
    }
  }

  toggle(hex: string, value?: boolean) {
    const h = hex.toUpperCase();
    const set = new Set(this._selectedHexes());
    const next = value ?? !set.has(h);
    if (next) set.add(h);
    else set.delete(h);
    this._selectedHexes.set(Array.from(set));

    if (next && !this.activeHexcode()) this.activeHexcode.set(h);
    if (!next && this.activeHexcode() === h) this.activeHexcode.set(this._selectedHexes()[0] ?? null);
  }

  remove(hex: string) { this.toggle(hex, false); }
  setActive(hex: string) { this.activeHexcode.set(hex.toUpperCase()); }

  setOverride(hex: string, label: string) {
    const h = hex.toUpperCase();
    const clean = (label ?? '').trim();
    this._overrides.update(prev => ({ ...prev, [h]: clean }));
  }

  clearOverride(hex: string) {
    const h = hex.toUpperCase();
    this._overrides.update(prev => {
      const { [h]: _, ...rest } = prev;
      return rest;
    });
  }

  applyOverridesFromText(text: string) {
    const map: Record<string, string> = { ...this._overrides() };

    for (const line of (text ?? '').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;

      const hex = trimmed.slice(0, idx).trim().toUpperCase();
      const label = trimmed.slice(idx + 1).trim();
      if (hex && label) map[hex] = label;
    }

    this._overrides.set(map);
  }
}
