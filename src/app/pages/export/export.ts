import { AfterViewInit, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import {
  CardMode,
  ModeASettings,
  ModeBSettings,
  SheetSettings,
  EmojiExporterService,
  SheetVariant
} from '../../core/services/emoji-exporter';
import { SelectionStoreService } from '../../core/services/selection-store';

type SheetLayoutB = 'mixed' | 'split';

type ExportPersist = {
  v: 3; // bump
  mode: CardMode;
  a: ModeASettings;
  b: ModeBSettings;
  sheet: SheetSettings;
  previewHex: string | null;
  zoom: number;

  // NEW
  bSheetLayout: SheetLayoutB;

  // pages for sheets
  sheetPageAll: number;

  sheetPageEmoji: number;
  sheetPageText: number;
};

const LS_KEY = 'emoji-en-folie:export:v3';

@Component({
  selector: 'app-export',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './export.html',
  styleUrl: './export.scss',
})
export class ExportComponent implements AfterViewInit {
  private readonly store = inject(SelectionStoreService);
  private readonly exporter = inject(EmojiExporterService);

  readonly selected = computed(() => this.store.selected());

  readonly mode = signal<CardMode>('A');

  readonly a = signal<ModeASettings>({
    cardW: 320, cardH: 260,
    emojiSize: 120,
    fontSize: 28,
    gapEmojiText: 10,
    borderPx: 6,
    radiusPx: 18,
    background: 'white',
  });

  readonly b = signal<ModeBSettings>({
    emojiCardW: 240, emojiCardH: 240,
    emojiSize: 140,
    textCardW: 240, textCardH: 140,
    fontSize: 28,
    borderPx: 6,
    radiusPx: 18,
    background: 'white',
  });

  readonly sheet = signal<SheetSettings>({
    cols: 6,
    gap: 16,
    rows: 4,
  });

  // NEW: Mode B layout for sheets
  readonly bSheetLayout = signal<SheetLayoutB>('mixed');

  // WYSIWYG (single card)
  readonly previewHex = signal<string | null>(null);
  readonly zoom = signal<number>(1);
  readonly lastSize = signal<{ w: number; h: number }>({ w: 0, h: 0 });

  readonly previewCanvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');

  readonly previewItem = computed(() => {
    const list = this.selected();
    if (!list.length) return null;

    const hex = this.previewHex();
    if (!hex) return list[0];

    return list.find(x => x.hexcode === hex) ?? list[0];
  });

  // ===== WYSIWYG planche - MIXED (all) =====
  readonly sheetPageAll = signal<number>(1);
  readonly sheetTotalAll = signal<number>(1);
  readonly sheetLastSizeAll = signal<{ w: number; h: number }>({ w: 0, h: 0 });
  readonly sheetPreviewCanvasAll = viewChild<ElementRef<HTMLCanvasElement>>('sheetPreview');

  private sheetRunIdAll = 0;

  // ===== WYSIWYG planche - SPLIT emoji =====
  readonly sheetPageEmoji = signal<number>(1);
  readonly sheetTotalEmoji = signal<number>(1);
  readonly sheetLastSizeEmoji = signal<{ w: number; h: number }>({ w: 0, h: 0 });
  readonly sheetPreviewCanvasEmoji = viewChild<ElementRef<HTMLCanvasElement>>('sheetPreviewEmoji');

  private sheetRunIdEmoji = 0;

  // ===== WYSIWYG planche - SPLIT text =====
  readonly sheetPageText = signal<number>(1);
  readonly sheetTotalText = signal<number>(1);
  readonly sheetLastSizeText = signal<{ w: number; h: number }>({ w: 0, h: 0 });
  readonly sheetPreviewCanvasText = viewChild<ElementRef<HTMLCanvasElement>>('sheetPreviewText');

  private sheetRunIdText = 0;

  constructor() {
    this.loadExportSettings();

    // Persist settings
    effect(() => {
      const payload: ExportPersist = {
        v: 3,
        mode: this.mode(),
        a: this.a(),
        b: this.b(),
        sheet: this.sheet(),
        previewHex: this.previewHex(),
        zoom: this.zoom(),
        bSheetLayout: this.bSheetLayout(),

        sheetPageAll: this.sheetPageAll(),
        sheetPageEmoji: this.sheetPageEmoji(),
        sheetPageText: this.sheetPageText(),
      };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    });

    // === clamp + totals (all) ===
    effect(() => {
      void this.mode();
      void this.bSheetLayout();
      void this.sheet();
      void this.selected().length;

      this.sheetTotalAll.set(this.computeSheetTotal('all'));

      const p = this.sheetPageAll();
      const total = this.sheetTotalAll();
      if (p < 1) this.sheetPageAll.set(1);
      else if (p > total) this.sheetPageAll.set(total);
    });

    // === clamp + totals (emoji/text) ===
    effect(() => {
      void this.mode();
      void this.bSheetLayout();
      void this.sheet();
      void this.selected().length;

      // only meaningful in mode B + split
      this.sheetTotalEmoji.set(this.computeSheetTotal('emoji'));
      this.sheetTotalText.set(this.computeSheetTotal('text'));

      const pE = this.sheetPageEmoji();
      const tE = this.sheetTotalEmoji();
      if (pE < 1) this.sheetPageEmoji.set(1);
      else if (pE > tE) this.sheetPageEmoji.set(tE);

      const pT = this.sheetPageText();
      const tT = this.sheetTotalText();
      if (pT < 1) this.sheetPageText.set(1);
      else if (pT > tT) this.sheetPageText.set(tT);
    });

    // Auto refresh planche preview(s)
    effect(() => {
      void this.mode();
      void this.bSheetLayout();
      void this.a();
      void this.b();
      void this.sheet();
      void this.selected().length;

      void this.sheetPageAll();
      void this.sheetPageEmoji();
      void this.sheetPageText();

      // refresh whichever is visible; harmless if canvas not in DOM (viewChild null)
      this.refreshSheetPreviewAll();
      this.refreshSheetPreviewEmoji();
      this.refreshSheetPreviewText();
    });

    // Auto refresh single-card preview
    effect(() => {
      void this.mode();
      void this.a();
      void this.b();
      void this.previewHex();
      void this.selected().length;
      this.refreshPreview();
    });
  }

  ngAfterViewInit(): void {
    this.refreshPreview();
    this.refreshSheetPreviewAll();
    this.refreshSheetPreviewEmoji();
    this.refreshSheetPreviewText();
  }

  isTransparentBg() {
    const bg = this.mode() === 'A' ? this.a().background : this.b().background;
    return bg === 'transparent';
  }

  setZoom(value: any) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    this.zoom.set(Math.max(0.2, Math.min(3, Math.round(v * 10) / 10)));
  }

  setPreviewHex(hex: string) {
    this.previewHex.set(hex || null);
  }

  prevPreview() {
    const list = this.selected();
    if (!list.length) return;
    const cur = this.previewItem();
    const idx = cur ? list.findIndex(x => x.hexcode === cur.hexcode) : 0;
    const next = (idx - 1 + list.length) % list.length;
    this.previewHex.set(list[next].hexcode);
  }

  nextPreview() {
    const list = this.selected();
    if (!list.length) return;
    const cur = this.previewItem();
    const idx = cur ? list.findIndex(x => x.hexcode === cur.hexcode) : 0;
    const next = (idx + 1) % list.length;
    this.previewHex.set(list[next].hexcode);
  }

  setBSheetLayout(layout: SheetLayoutB) {
    this.bSheetLayout.set(layout);
  }

  private loadExportSettings() {
    const legacyKeyV2 = 'emoji-en-folie:export:v2';
    const legacyKeyV1 = 'emoji-en-folie:export:v1';

    try {
      const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(legacyKeyV2) ?? localStorage.getItem(legacyKeyV1);
      if (!raw) return;

      const p = JSON.parse(raw) as any;

      // v3
      if (p?.v === 3) {
        this.mode.set(p.mode);
        this.a.set(p.a);
        this.b.set(p.b);

        const sh: any = p.sheet ?? {};
        this.sheet.set({
          cols: sh.cols ?? 6,
          rows: sh.rows ?? 4,
          gap: sh.gap ?? 16,
        });

        this.previewHex.set(p.previewHex ?? null);
        this.zoom.set(Number.isFinite(p.zoom) ? p.zoom : 1);

        this.bSheetLayout.set(p.bSheetLayout === 'split' ? 'split' : 'mixed');

        this.sheetPageAll.set(Number.isFinite(p.sheetPageAll) ? Math.max(1, Math.floor(p.sheetPageAll)) : 1);
        this.sheetPageEmoji.set(Number.isFinite(p.sheetPageEmoji) ? Math.max(1, Math.floor(p.sheetPageEmoji)) : 1);
        this.sheetPageText.set(Number.isFinite(p.sheetPageText) ? Math.max(1, Math.floor(p.sheetPageText)) : 1);

        this.clampSheet();
        this.setZoom(this.zoom());
        return;
      }

      // v2 fallback
      if (p?.v === 2) {
        this.mode.set(p.mode);
        this.a.set(p.a);
        this.b.set(p.b);

        const sh: any = p.sheet ?? {};
        this.sheet.set({
          cols: sh.cols ?? 6,
          rows: sh.rows ?? 4,
          gap: sh.gap ?? 16,
        });

        this.previewHex.set(p.previewHex ?? null);
        this.zoom.set(Number.isFinite(p.zoom) ? p.zoom : 1);

        this.bSheetLayout.set('mixed');

        this.clampSheet();
        this.setZoom(this.zoom());
        return;
      }

      // v1 fallback
      if (p?.v === 1) {
        this.mode.set(p.mode);
        this.a.set(p.a);
        this.b.set(p.b);

        const sh: any = p.sheet ?? {};
        this.sheet.set({
          cols: sh.cols ?? 6,
          rows: sh.rows ?? 4,
          gap: sh.gap ?? 16,
        });

        this.bSheetLayout.set('mixed');
        this.clampSheet();
      }
    } catch {
      // ignore
    }
  }

  private clampSheet() {
    const s: any = this.sheet();
    const MAX_DIM = 50;

    this.sheet.set({
      cols: Math.max(1, Math.min(MAX_DIM, Math.floor(s.cols))),
      rows: Math.max(1, Math.min(MAX_DIM, Math.floor(s.rows ?? 4))),
      gap: Math.max(0, Math.floor(s.gap)),
    });
  }

  setNum(path: string, value: any) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;

    if (path.startsWith('a.')) {
      const key = path.slice(2) as keyof ModeASettings;
      this.a.set({ ...this.a(), [key]: Math.max(0, Math.floor(v)) } as ModeASettings);
    } else if (path.startsWith('b.')) {
      const key = path.slice(2) as keyof ModeBSettings;
      this.b.set({ ...this.b(), [key]: Math.max(0, Math.floor(v)) } as ModeBSettings);
    } else if (path.startsWith('sheet.')) {
      const key = path.slice(6) as keyof SheetSettings;
      this.sheet.set({ ...this.sheet(), [key]: Math.max(0, Math.floor(v)) });
      this.clampSheet();
    }
  }

  setBg(bg: 'white' | 'transparent') {
    this.a.set({ ...this.a(), background: bg });
    this.b.set({ ...this.b(), background: bg });
  }

  async refreshPreview() {
    const canvasRef = this.previewCanvas();
    if (!canvasRef) return;

    const canvas = canvasRef.nativeElement;
    const item = this.previewItem();

    if (!item) {
      const ctx = canvas.getContext('2d');
      canvas.width = 360;
      canvas.height = 220;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      if (ctx) {
        ctx.font = '16px Roboto, Arial';
        ctx.fillText('Aucune sélection.', 12, 30);
      }
      this.lastSize.set({ w: canvas.width, h: canvas.height });
      return;
    }

    try {
      await this.exporter.renderPreview(canvas, this.mode(), item, this.a(), this.b());
      this.lastSize.set({ w: canvas.width, h: canvas.height });
    } catch {
      const ctx = canvas.getContext('2d');
      canvas.width = 420;
      canvas.height = 240;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      if (ctx) {
        ctx.font = '16px Roboto, Arial';
        ctx.fillText('Preview impossible (SVG/CORS).', 12, 30);
      }
      this.lastSize.set({ w: canvas.width, h: canvas.height });
    }
  }

  async exportCards() {
    if (!this.selected().length) return;
    await this.exporter.exportOnePngPerCard(this.mode(), this.selected(), this.a(), this.b());
  }

  async exportSheets() {
    if (!this.selected().length) return;
    this.clampSheet();

    // Mode B + split => 2 exports
    if (this.mode() === 'B' && this.bSheetLayout() === 'split') {
      await this.exporter.exportSheets('B', this.selected(), this.a(), this.b(), this.sheet(), 'emoji', 'planche_emojis');
      await this.exporter.exportSheets('B', this.selected(), this.a(), this.b(), this.sheet(), 'text', 'planche_mots');
      return;
    }

    // default: all / mixed
    await this.exporter.exportSheets(this.mode(), this.selected(), this.a(), this.b(), this.sheet(), 'all', 'planche');
  }

  private computeSheetTotal(variant: SheetVariant): number {
    const n = this.selected().length;
    if (!n) return 1;

    const cols = Math.max(1, Math.floor(this.sheet().cols));
    const rows = Math.max(1, Math.floor(this.sheet().rows));
    const per = Math.max(1, cols * rows);

    const tiles =
      this.mode() === 'A'
        ? n
        : (variant === 'all' ? n * 2 : n);

    return Math.max(1, Math.ceil(tiles / per));
  }

  // ===== Page setters: all =====
  setSheetPageAll(value: any) {
    const v = Math.floor(Number(value));
    if (!Number.isFinite(v)) return;
    this.sheetPageAll.set(Math.max(1, Math.min(this.sheetTotalAll(), v)));
  }
  prevSheetAll() {
    this.sheetPageAll.set(Math.max(1, this.sheetPageAll() - 1));
  }
  nextSheetAll() {
    this.sheetPageAll.set(Math.min(this.sheetTotalAll(), this.sheetPageAll() + 1));
  }

  // ===== Page setters: emoji =====
  setSheetPageEmoji(value: any) {
    const v = Math.floor(Number(value));
    if (!Number.isFinite(v)) return;
    this.sheetPageEmoji.set(Math.max(1, Math.min(this.sheetTotalEmoji(), v)));
  }
  prevSheetEmoji() {
    this.sheetPageEmoji.set(Math.max(1, this.sheetPageEmoji() - 1));
  }
  nextSheetEmoji() {
    this.sheetPageEmoji.set(Math.min(this.sheetTotalEmoji(), this.sheetPageEmoji() + 1));
  }

  // ===== Page setters: text =====
  setSheetPageText(value: any) {
    const v = Math.floor(Number(value));
    if (!Number.isFinite(v)) return;
    this.sheetPageText.set(Math.max(1, Math.min(this.sheetTotalText(), v)));
  }
  prevSheetText() {
    this.sheetPageText.set(Math.max(1, this.sheetPageText() - 1));
  }
  nextSheetText() {
    this.sheetPageText.set(Math.min(this.sheetTotalText(), this.sheetPageText() + 1));
  }

  // ===== Renders =====

  private async drawEmptySheet(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    canvas.width = 420;
    canvas.height = 240;
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    if (ctx) {
      ctx.font = '16px Roboto, Arial';
      ctx.fillText('Aucune sélection.', 12, 30);
    }
  }

  async refreshSheetPreviewAll() {
    // Only show in: mode A OR mode B mixed
    if (this.mode() === 'B' && this.bSheetLayout() === 'split') return;

    const canvasRef = this.sheetPreviewCanvasAll();
    if (!canvasRef) return;

    const canvas = canvasRef.nativeElement;
    const list = this.selected();

    if (!list.length) {
      await this.drawEmptySheet(canvas);
      this.sheetLastSizeAll.set({ w: canvas.width, h: canvas.height });
      this.sheetTotalAll.set(1);
      return;
    }

    const run = ++this.sheetRunIdAll;

    try {
      const res = await this.exporter.renderSheetPreview(
        canvas,
        this.mode(),
        list,
        this.a(),
        this.b(),
        this.sheet(),
        this.sheetPageAll() - 1,
        'all'
      );

      if (run !== this.sheetRunIdAll) return;
      this.sheetTotalAll.set(res.totalSheets);
      this.sheetLastSizeAll.set({ w: canvas.width, h: canvas.height });
    } catch {
      if (run !== this.sheetRunIdAll) return;
      const ctx = canvas.getContext('2d');
      canvas.width = 520;
      canvas.height = 260;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      if (ctx) {
        ctx.font = '16px Roboto, Arial';
        ctx.fillText('Preview planche impossible (SVG/CORS).', 12, 30);
      }
      this.sheetLastSizeAll.set({ w: canvas.width, h: canvas.height });
    }
  }

  async refreshSheetPreviewEmoji() {
    // Only show in mode B split
    if (!(this.mode() === 'B' && this.bSheetLayout() === 'split')) return;

    const canvasRef = this.sheetPreviewCanvasEmoji();
    if (!canvasRef) return;

    const canvas = canvasRef.nativeElement;
    const list = this.selected();

    if (!list.length) {
      await this.drawEmptySheet(canvas);
      this.sheetLastSizeEmoji.set({ w: canvas.width, h: canvas.height });
      this.sheetTotalEmoji.set(1);
      return;
    }

    const run = ++this.sheetRunIdEmoji;

    try {
      const res = await this.exporter.renderSheetPreview(
        canvas,
        'B',
        list,
        this.a(),
        this.b(),
        this.sheet(),
        this.sheetPageEmoji() - 1,
        'emoji'
      );

      if (run !== this.sheetRunIdEmoji) return;
      this.sheetTotalEmoji.set(res.totalSheets);
      this.sheetLastSizeEmoji.set({ w: canvas.width, h: canvas.height });
    } catch {
      if (run !== this.sheetRunIdEmoji) return;
      const ctx = canvas.getContext('2d');
      canvas.width = 520;
      canvas.height = 260;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      if (ctx) {
        ctx.font = '16px Roboto, Arial';
        ctx.fillText('Preview planche impossible (SVG/CORS).', 12, 30);
      }
      this.sheetLastSizeEmoji.set({ w: canvas.width, h: canvas.height });
    }
  }

  async refreshSheetPreviewText() {
    // Only show in mode B split
    if (!(this.mode() === 'B' && this.bSheetLayout() === 'split')) return;

    const canvasRef = this.sheetPreviewCanvasText();
    if (!canvasRef) return;

    const canvas = canvasRef.nativeElement;
    const list = this.selected();

    if (!list.length) {
      await this.drawEmptySheet(canvas);
      this.sheetLastSizeText.set({ w: canvas.width, h: canvas.height });
      this.sheetTotalText.set(1);
      return;
    }

    const run = ++this.sheetRunIdText;

    try {
      const res = await this.exporter.renderSheetPreview(
        canvas,
        'B',
        list,
        this.a(),
        this.b(),
        this.sheet(),
        this.sheetPageText() - 1,
        'text'
      );

      if (run !== this.sheetRunIdText) return;
      this.sheetTotalText.set(res.totalSheets);
      this.sheetLastSizeText.set({ w: canvas.width, h: canvas.height });
    } catch {
      if (run !== this.sheetRunIdText) return;
      const ctx = canvas.getContext('2d');
      canvas.width = 520;
      canvas.height = 260;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      if (ctx) {
        ctx.font = '16px Roboto, Arial';
        ctx.fillText('Preview planche impossible (SVG/CORS).', 12, 30);
      }
      this.sheetLastSizeText.set({ w: canvas.width, h: canvas.height });
    }
  }
}
