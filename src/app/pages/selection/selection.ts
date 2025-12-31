import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SelectionStoreService } from '../../core/services/selection-store';


@Component({
  selector: 'app-selection',
  standalone: true,
  imports: [CommonModule, MatListModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './selection.html',
  styleUrl: './selection.scss',
})
export class SelectionComponent {
  readonly store = inject(SelectionStoreService);

  readonly selected = computed(() => this.store.selected());
  readonly active = computed(() => {
    const hex = this.store.activeHexcode();
    return this.selected().find(x => x.hexcode === hex) ?? this.selected()[0] ?? null;
  });

  readonly bulkText = signal('');

  setActive(hex: string) {
    this.store.setActive(hex);
  }

  updateActiveLabel(value: string) {
    const a = this.active();
    if (!a) return;
    this.store.setOverride(a.hexcode, value || '');
  }

  clearActiveOverride() {
    const a = this.active();
    if (!a) return;
    this.store.clearOverride(a.hexcode);
  }

  applyBulk() {
    this.store.applyOverridesFromText(this.bulkText());
  }
}
