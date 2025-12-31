import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatExpansionModule } from '@angular/material/expansion';

import type { EmojiItem } from '../../core/models/emoji.models';
import { EmojiCatalogService } from '../../core/services/emoji-catalog';
import { SelectionStoreService } from '../../core/services/selection-store';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatExpansionModule,
  ],
  templateUrl: './catalog.html',
  styleUrl: './catalog.scss',
})
export class CatalogComponent {
  private readonly catalog = inject(EmojiCatalogService);
  readonly store = inject(SelectionStoreService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtered = computed(() => {
    const q = this.store.query().trim().toLowerCase();
    const groupFilter = this.store.groupFilter();
    const items = this.store.items();

    return items.filter(i => {
      if (groupFilter !== 'Tous' && i.group !== groupFilter) return false;
      if (!q) return true;

      const hay = [
        i.hexcode,
        i.labelResolved,
        i.labelOpenMoji,
        i.group,
        i.subgroup,
        ...(i.tags ?? []),
      ].join(' ').toLowerCase();

      return hay.includes(q);
    });
  });

  readonly groups = computed(() => {
    const map = new Map<string, EmojiItem[]>();
    for (const i of this.filtered()) {
      const arr = map.get(i.group) ?? [];
      arr.push(i);
      map.set(i.group, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  readonly selectedCountByGroup = computed(() => {
    const map = new Map<string, number>();
    for (const it of this.store.selected()) {
      map.set(it.group, (map.get(it.group) ?? 0) + 1);
    }
    return map;
  });

  constructor() {
    // Auto-load once, and reload when includeExtras / enableEmojibase changes (data shape changes)
    effect(() => {
      const needReload = [
        this.store.includeExtrasUnicode(),
        this.store.enableEmojibaseFr(),
      ];
      void needReload;

      if (!this.store.items().length && !this.loading()) {
        this.load();
      } else {
        // If user toggles these AFTER having loaded, reload dataset
        // (safe: doesn't lose selection/overrides because store persists by hex)
        this.load();
      }
    });
  }

  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);

    try {
      const items = await this.catalog.buildItems({
        includeExtrasUnicode: this.store.includeExtrasUnicode(),
        enableEmojibaseFr: this.store.enableEmojibaseFr(),
      });
      this.store.setItems(items);
      //console.log("items",items);
      
    } catch (e: any) {
      this.error.set(e?.message ?? 'Erreur inconnue');
    } finally {
      this.loading.set(false);
    }
  }

  selectAllInGroup(group: string) {
    for (const i of this.store.items()) {
      if (i.group === group) this.store.toggle(i.hexcode, true);
    }
  }

  deselectAllInGroup(group: string) {
    for (const i of this.store.items()) {
      if (i.group === group) this.store.toggle(i.hexcode, false);
    }
  }
}
