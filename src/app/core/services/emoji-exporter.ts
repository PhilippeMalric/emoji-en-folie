import { Injectable } from '@angular/core';
import type { EmojiItem } from '../models/emoji.models';

export type CardMode = 'A' | 'B';
export type SheetVariant = 'all' | 'emoji' | 'text';

export interface CommonCardStyle {
  borderPx: number;
  radiusPx: number;
  background: 'white' | 'transparent';
}

export interface ModeASettings extends CommonCardStyle {
  cardW: number;
  cardH: number;
  emojiSize: number;
  fontSize: number;
  gapEmojiText: number;
}

export interface ModeBSettings extends CommonCardStyle {
  emojiCardW: number;
  emojiCardH: number;
  emojiSize: number;

  textCardW: number;
  textCardH: number;
  fontSize: number;
}

export interface SheetSettings {
  cols: number;
  gap: number; // px
  rows: number;
}

type Tile = {
  w: number;
  h: number;
  filenameHint: string;
  draw: (ctx: CanvasRenderingContext2D) => Promise<void>;
};

@Injectable({ providedIn: 'root' })
export class EmojiExporterService {
  private readonly svgCache = new Map<string, Promise<HTMLImageElement>>();

  private svgUrlToImage(svgUrl: string): Promise<HTMLImageElement> {
    const hit = this.svgCache.get(svgUrl);
    if (hit) return hit;

    const p = (async () => {
      const res = await fetch(svgUrl);
      if (!res.ok) throw new Error(`SVG fetch failed: ${res.status}`);
      const svgText = await res.text();

      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('SVG image load failed'));
          i.src = url;
        });
        return img;
      } finally {
        URL.revokeObjectURL(url);
      }
    })();

    this.svgCache.set(svgUrl, p);
    p.catch(() => this.svgCache.delete(svgUrl));
    return p;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    // @ts-ignore
    if (ctx.roundRect) {
      ctx.beginPath();
      // @ts-ignore
      ctx.roundRect(x, y, w, h, rr);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
  }

  private drawCardBase(ctx: CanvasRenderingContext2D, w: number, h: number, style: CommonCardStyle) {
    ctx.clearRect(0, 0, w, h);

    if (style.background === 'white') {
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, 0, 0, w, h, style.radiusPx);
      ctx.fill();
    }

    ctx.lineWidth = style.borderPx;
    ctx.strokeStyle = '#000000';
    this.roundRect(ctx, style.borderPx / 2, style.borderPx / 2, w - style.borderPx, h - style.borderPx, style.radiusPx);
    ctx.stroke();
  }

  private fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    const clean = (text ?? '').trim();
    if (!clean) return '';
    if (ctx.measureText(clean).width <= maxW) return clean;

    const ell = '…';
    let lo = 0;
    let hi = clean.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = clean.slice(0, mid) + ell;
      if (ctx.measureText(candidate).width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return clean.slice(0, lo) + ell;
  }

  private sanitizeFilenamePart(s: string): string {
    return (s ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\/\\?%*:|"<>]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  private async renderTileToDataUrl(tile: Tile): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = tile.w;
    canvas.height = tile.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    await tile.draw(ctx);
    return canvas.toDataURL('image/png');
  }

  private downloadDataUrl(dataUrl: string, filename: string) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  // ===== NEW: petites usines de Tile (pour éviter de dupliquer du code) =====

  private makeTileA(it: EmojiItem, a: ModeASettings, idx: number, safeLabel: string, safeHex: string): Tile {
    return {
      w: a.cardW,
      h: a.cardH,
      filenameHint: `${String(idx).padStart(3, '0')}_${safeLabel}_${safeHex}.png`,
      draw: async (ctx) => {
        this.drawCardBase(ctx, a.cardW, a.cardH, a);

        const img = await this.svgUrlToImage(it.svgUrl);
        const cx = a.cardW / 2;
        const top = a.borderPx + 8;

        const es = a.emojiSize;
        ctx.drawImage(img, cx - es / 2, top, es, es);

        ctx.fillStyle = '#000000';
        ctx.font = `700 ${a.fontSize}px Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const maxW = a.cardW - (a.borderPx + 12) * 2;
        const text = this.fitText(ctx, it.labelResolved || '', maxW);
        ctx.fillText(text, cx, top + es + a.gapEmojiText);
      }
    };
  }

  private makeEmojiTileB(it: EmojiItem, b: ModeBSettings, idx: number, safeLabel: string, safeHex: string): Tile {
    return {
      w: b.emojiCardW,
      h: b.emojiCardH,
      filenameHint: `${String(idx).padStart(3, '0')}_${safeLabel}_${safeHex}_emoji.png`,
      draw: async (ctx) => {
        this.drawCardBase(ctx, b.emojiCardW, b.emojiCardH, b);
        const img = await this.svgUrlToImage(it.svgUrl);
        const es = b.emojiSize;
        ctx.drawImage(img, (b.emojiCardW - es) / 2, (b.emojiCardH - es) / 2, es, es);
      }
    };
  }

  private makeTextTileB(it: EmojiItem, b: ModeBSettings, idx: number, safeLabel: string, safeHex: string): Tile {
    return {
      w: b.textCardW,
      h: b.textCardH,
      filenameHint: `${String(idx).padStart(3, '0')}_${safeLabel}_${safeHex}_texte.png`,
      draw: async (ctx) => {
        this.drawCardBase(ctx, b.textCardW, b.textCardH, b);
        ctx.fillStyle = '#000000';
        ctx.font = `700 ${b.fontSize}px Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxW = b.textCardW - (b.borderPx + 12) * 2;
        const text = this.fitText(ctx, it.labelResolved || '', maxW);
        ctx.fillText(text, b.textCardW / 2, b.textCardH / 2);
      }
    };
  }

  /**
   * NEW: variant pour les planches en mode B
   * - mode A: variant ignoré
   * - mode B + 'all'  : [emoji, texte] pour chaque item (comportement actuel)
   * - mode B + 'emoji': uniquement les tuiles emoji
   * - mode B + 'text' : uniquement les tuiles texte
   */
  private makeTiles(
    mode: CardMode,
    items: EmojiItem[],
    a: ModeASettings,
    b: ModeBSettings,
    variant: SheetVariant = 'all'
  ): Tile[] {
    const tiles: Tile[] = [];
    let idx = 1;

    for (const it of items) {
      const safeLabel = this.sanitizeFilenamePart(it.labelResolved || 'emoji');
      const safeHex = this.sanitizeFilenamePart(it.hexcode);

      if (mode === 'A') {
        tiles.push(this.makeTileA(it, a, idx, safeLabel, safeHex));
        idx++;
        continue;
      }

      // mode B
      if (variant === 'emoji') {
        tiles.push(this.makeEmojiTileB(it, b, idx, safeLabel, safeHex));
      } else if (variant === 'text') {
        tiles.push(this.makeTextTileB(it, b, idx, safeLabel, safeHex));
      } else {
        // 'all' (mixé): emoji puis texte
        tiles.push(this.makeEmojiTileB(it, b, idx, safeLabel, safeHex));
        tiles.push(this.makeTextTileB(it, b, idx, safeLabel, safeHex));
      }

      idx++;
    }

    return tiles;
  }

  // PREVIEW: render the first tile for one item on a given canvas
  async renderPreview(canvas: HTMLCanvasElement, mode: CardMode, item: EmojiItem, a: ModeASettings, b: ModeBSettings) {
    // preview carte: on garde le comportement actuel (mode B => emoji)
    const tiles = this.makeTiles(mode, [item], a, b, 'all');
    const t = tiles[0];
    canvas.width = t.w;
    canvas.height = t.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    await t.draw(ctx);
  }

  async exportOnePngPerCard(mode: CardMode, items: EmojiItem[], a: ModeASettings, b: ModeBSettings) {
    const tiles = this.makeTiles(mode, items, a, b, 'all');
    for (const t of tiles) {
      const dataUrl = await this.renderTileToDataUrl(t);
      this.downloadDataUrl(dataUrl, t.filenameHint);
    }
  }

  /**
   * NEW: exportSheets accepte variant + prefix
   * - variant 'all'  => mixé (par défaut)
   * - variant 'emoji'=> planches d'emojis
   * - variant 'text' => planches de mots
   */
  async exportSheets(
    mode: CardMode,
    items: EmojiItem[],
    a: ModeASettings,
    b: ModeBSettings,
    sheet: SheetSettings,
    variant: SheetVariant = 'all',
    filenamePrefix?: string
  ) {
    const tiles = this.makeTiles(mode, items, a, b, variant);

    const MAX_DIM = 50;
    const cols = Math.max(1, Math.min(MAX_DIM, Math.floor(sheet.cols)));
    const rowsLimit = Math.max(1, Math.min(MAX_DIM, Math.floor(sheet.rows)));
    const gap = Math.max(0, Math.floor(sheet.gap));

    const maxPerSheet = cols * rowsLimit;
    const totalSheets = Math.max(1, Math.ceil(tiles.length / maxPerSheet));

    const prefix =
      filenamePrefix ??
      (variant === 'emoji' ? 'planche_emojis' : variant === 'text' ? 'planche_mots' : 'planche');

    for (let s = 0; s < totalSheets; s++) {
      const slice = tiles.slice(s * maxPerSheet, (s + 1) * maxPerSheet);

      const canvas = document.createElement('canvas');
      await this.renderSheetIntoCanvas(canvas, slice, cols, rowsLimit, gap);

      const out = canvas.toDataURL('image/png');
      const filename = `${prefix}_${String(s + 1).padStart(2, '0')}_sur_${String(totalSheets).padStart(2, '0')}.png`;

      this.downloadDataUrl(out, filename);
    }
  }

  private computeSheetLayout(slice: Tile[], cols: number, rowsLimit: number, gap: number) {
    const maxPerSheet = cols * rowsLimit;
    const used = slice.slice(0, maxPerSheet);
    const rows = Math.min(rowsLimit, Math.max(1, Math.ceil(used.length / cols)));

    const colW = Array.from({ length: cols }, () => 0);
    const rowH = Array.from({ length: rows }, () => 0);

    for (let k = 0; k < used.length; k++) {
      const r = Math.floor(k / cols);
      const c = k % cols;
      colW[c] = Math.max(colW[c], used[k].w);
      rowH[r] = Math.max(rowH[r], used[k].h);
    }

    const sheetW = colW.reduce((acc, x) => acc + x, 0) + gap * (cols - 1);
    const sheetH = rowH.reduce((acc, x) => acc + x, 0) + gap * (rows - 1);

    const xOff: number[] = [];
    const yOff: number[] = [];
    let acc = 0;

    for (let c = 0; c < cols; c++) {
      xOff[c] = acc;
      acc += colW[c] + gap;
    }

    acc = 0;
    for (let r = 0; r < rows; r++) {
      yOff[r] = acc;
      acc += rowH[r] + gap;
    }

    return { used, rows, colW, rowH, xOff, yOff, sheetW, sheetH };
  }

  private async renderSheetIntoCanvas(canvas: HTMLCanvasElement, slice: Tile[], cols: number, rowsLimit: number, gap: number) {
    const { used, colW, rowH, xOff, yOff, sheetW, sheetH } = this.computeSheetLayout(slice, cols, rowsLimit, gap);

    canvas.width = Math.max(1, Math.ceil(sheetW));
    canvas.height = Math.max(1, Math.ceil(sheetH));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let k = 0; k < used.length; k++) {
      const r = Math.floor(k / cols);
      const c = k % cols;
      const t = used[k];

      const dx = xOff[c] + (colW[c] - t.w) / 2;
      const dy = yOff[r] + (rowH[r] - t.h) / 2;

      ctx.save();
      ctx.translate(dx, dy);
      await t.draw(ctx);
      ctx.restore();
    }
  }

  /**
   * NEW: renderSheetPreview accepte variant
   */
  async renderSheetPreview(
    canvas: HTMLCanvasElement,
    mode: CardMode,
    items: EmojiItem[],
    a: ModeASettings,
    b: ModeBSettings,
    sheet: SheetSettings,
    sheetIndexZeroBased: number,
    variant: SheetVariant = 'all'
  ): Promise<{ totalSheets: number }> {
    const tiles = this.makeTiles(mode, items, a, b, variant);

    const MAX_DIM = 50;
    const cols = Math.max(1, Math.min(MAX_DIM, Math.floor(sheet.cols)));
    const rowsLimit = Math.max(1, Math.min(MAX_DIM, Math.floor(sheet.rows)));
    const gap = Math.max(0, Math.floor(sheet.gap));

    const maxPerSheet = cols * rowsLimit;
    const totalSheets = Math.max(1, Math.ceil(tiles.length / maxPerSheet));

    const s = Math.max(0, Math.min(totalSheets - 1, Math.floor(sheetIndexZeroBased)));
    const slice = tiles.slice(s * maxPerSheet, (s + 1) * maxPerSheet);

    await this.renderSheetIntoCanvas(canvas, slice, cols, rowsLimit, gap);

    return { totalSheets };
  }
}
