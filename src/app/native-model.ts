export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1414;
/** Thin frame used when panel borders are included in an exported image. */
export const PANEL_BORDER_WIDTH = 1.5;
/** Resolve public assets under both localhost and a GitHub Pages project path. */
export function assetUrl(path: string): string {
  if (!path || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http:') || path.startsWith('https:')) return path;
  const clean = path.replace(/^\/+/, '');
  if (typeof document === 'undefined') return path;
  let base = document.querySelector('base')?.getAttribute('href') || '/';
  if (!base.endsWith('/')) base += '/';
  return `${base}${clean}`;
}
export type NativeTool = 'pen' | 'eraser' | 'line' | 'rect' | 'text' | 'stamp' | 'lasso';
export type Direction = 'rtl' | 'ltr' | 'ttb';
export interface NativeText {
  id: string;
  text: string;
  size: number;
  vertical: boolean;
  x: number;
  y: number;
}
export interface NativePanel {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** A new storyboard always starts with one editable case. */
export type PanelTemplate = 'one';
export interface NativePanelLayout {
  template: PanelTemplate;
  margin: number;
  gutter: number;
  /** Width of the vertical gutter between side-by-side panels. */
  verticalGutter?: number;
  /** Height of the horizontal gutter between stacked panels. */
  horizontalGutter?: number;
  panels: NativePanel[];
}
export interface NativePage {
  id: string;
  bitmap: string;
  thumbnail: string;
  texts: NativeText[];
  panels?: NativePanelLayout;
}
export interface NativeDraft {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  direction: Direction;
  firstSpread: boolean;
  /** Whether the global storyboard displays physical double-page spreads. */
  spreadView?: boolean;
  /** Whether panel borders are visible in the storyboard and export UI. */
  showPanels?: boolean;
  guide: string;
  pages: NativePage[];
}
export const newNativePage = (): NativePage => ({ id: crypto.randomUUID(), bitmap: '', thumbnail: '', texts: [] });
/** Create the single starting case used by direct panel editing. */
export function panelLayout(_template: PanelTemplate = 'one', margin = 70, gutter = 14): NativePanelLayout {
  // Manga layouts use a narrower vertical gutter and a wider horizontal gutter.
  const verticalGutter = Math.max(4, Math.round(gutter * .75));
  const horizontalGutter = Math.max(verticalGutter + 4, Math.round(gutter * 1.33));
  return {
    template: 'one',
    margin,
    gutter,
    verticalGutter,
    horizontalGutter,
    panels: [{ x: margin, y: margin, width: PAGE_WIDTH - margin * 2, height: PAGE_HEIGHT - margin * 2 }],
  };
}

/** Split one existing case at a page-space coordinate, preserving its gutter. */
export function splitPanel(layout: NativePanelLayout, panelIndex: number, orientation: 'vertical' | 'horizontal', position: number): NativePanelLayout | null {
  const panel = layout.panels[panelIndex];
  if (!panel) return null;
  const gutter = orientation === 'vertical'
    ? Math.max(4, layout.verticalGutter ?? Math.round(layout.gutter * .75))
    : Math.max(4, layout.horizontalGutter ?? Math.round(layout.gutter * 1.33));
  const minimum = 90;
  const start = orientation === 'vertical' ? panel.x : panel.y;
  const end = orientation === 'vertical' ? panel.x + panel.width : panel.y + panel.height;
  const cut = Math.max(start + minimum + gutter / 2, Math.min(end - minimum - gutter / 2, position));
  if (cut <= start + minimum + gutter / 2 || cut >= end - minimum - gutter / 2) return null;
  const first = { ...panel }, second = { ...panel };
  if (orientation === 'vertical') {
    first.width = cut - gutter / 2 - panel.x;
    second.x = cut + gutter / 2;
    second.width = panel.x + panel.width - second.x;
  } else {
    first.height = cut - gutter / 2 - panel.y;
    second.y = cut + gutter / 2;
    second.height = panel.y + panel.height - second.y;
  }
  const panels = [...layout.panels.slice(0, panelIndex), first, second, ...layout.panels.slice(panelIndex + 1)];
  return { ...layout, panels };
}

/** Merge two adjacent cases when their union is a rectangle. */
export function mergePanels(layout: NativePanelLayout, firstIndex: number, secondIndex: number): NativePanelLayout | null {
  if (firstIndex === secondIndex || !layout.panels[firstIndex] || !layout.panels[secondIndex]) return null;
  const a = layout.panels[firstIndex], b = layout.panels[secondIndex];
  const tolerance = 2;
  const sameRow = Math.abs(a.y - b.y) <= tolerance && Math.abs((a.y + a.height) - (b.y + b.height)) <= tolerance;
  const sameColumn = Math.abs(a.x - b.x) <= tolerance && Math.abs((a.x + a.width) - (b.x + b.width)) <= tolerance;
  if (!sameRow && !sameColumn) return null;
  const gutter = sameRow
    ? Math.max(4, layout.verticalGutter ?? Math.round(layout.gutter * .75))
    : Math.max(4, layout.horizontalGutter ?? Math.round(layout.gutter * 1.33));
  const gap = sameRow
    ? Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
    : Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
  if (gap < 0 || gap > gutter * 2.5) return null;
  const merged: NativePanel = {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
    height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
  };
  const lower = Math.max(firstIndex, secondIndex), upper = Math.min(firstIndex, secondIndex);
  const panels = layout.panels.filter((_, index) => index !== lower && index !== upper);
  panels.splice(upper, 0, merged);
  return { ...layout, panels };
}
export function parseSimpleScript(source: string): string[][] {
  const pages: string[][] = [[]];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (/^-{3,}$/.test(line)) { pages.push([]); continue; }
    if (line.startsWith('-')) {
      const dialogue = line.replace(/^-+\s*/, '').trim();
      if (dialogue) pages[pages.length - 1].push(dialogue);
    }
  }
  while (pages.length > 1 && pages.at(-1)!.length === 0) pages.pop();
  return pages;
}
export function newNativeDraft(title: string): NativeDraft {
  return { id: crypto.randomUUID(), title: title.trim() || 'No Title', createdAt: Date.now(), updatedAt: Date.now(), direction: 'rtl', firstSpread: true, spreadView: false, guide: '', pages: [newNativePage()] };
}
export function sampleDraft(): NativeDraft {
  return { ...newNativeDraft('Sample Draft'), pages: Array.from({ length: 5 }, (_, i) => i < 3
    ? { ...newNativePage(), bitmap: `/native/sample${i}.png`, thumbnail: `/native/sample${i}_list.png` }
    : newNativePage()) };
}
export const GUIDES = [
  ['', 'No Rulers'], ['crop_mark_only1', 'Trim mark For Magazine'], ['crop_mark_only2', 'Trim mark For Dojinshi'],
  ['grid1', 'Grid For Magazine'], ['grid2', 'Grid For Dojinshi'],
  ['vertical_four1', 'Vertical four For Magazine'], ['vertical_four2', 'Vertical four For Dojinshi'],
] as const;
export function pageGrid(draft: NativeDraft, columns: number): (NativePage | null)[] {
  if (draft.direction === 'ttb') return [...draft.pages];
  const cells: (NativePage | null)[] = draft.firstSpread ? [...draft.pages] : [null, ...draft.pages];
  while (cells.length % columns) cells.push(null);
  if (draft.direction === 'rtl') {
    for (let i = 0; i < cells.length; i += columns) cells.splice(i, columns, ...cells.slice(i, i + columns).reverse());
  }
  return cells;
}

export type StoryboardSpread = [NativePage | null, NativePage | null];

/**
 * Arrange real pages into physical double-page spreads for the global storyboard.
 * The tuple order is always left | right as it appears on screen. Blank slots are
 * virtual placeholders and never become pages in the draft.
 */
export function storyboardSpreads(draft: NativeDraft): StoryboardSpread[] {
  const pages = draft.pages;
  if (!pages.length) return [];
  if (draft.direction === 'ttb') return pages.map(page => [page, null]);

  const first: StoryboardSpread = draft.direction === 'rtl' ? [pages[0], null] : [null, pages[0]];
  if (pages.length === 1) return [first];

  // After the cover, pair the remaining reading-order pages. When the count is
  // even, the final page is left alone and receives the virtual outside blank;
  // when it is odd, it naturally closes the final interior pair (P5 | P4).
  const remaining = pages.slice(1);
  const spreads: StoryboardSpread[] = [first];
  for (let index = 0; index < remaining.length; index += 2) {
    const left = remaining[index], right = remaining[index + 1];
    if (right) spreads.push(draft.direction === 'rtl' ? [right, left] : [left, right]);
    else spreads.push(draft.direction === 'rtl' ? [null, left] : [left, null]);
  }
  return spreads;
}
export const nativeImage = (name: string) => assetUrl(`/native/${name}.png`);
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = assetUrl(src);
  await image.decode();
  return image;
}
// Android's text API is replaced by an entirely local renderer. Text remains separately editable.
export function textBitmap(text: Pick<NativeText, 'text' | 'size' | 'vertical'>): HTMLCanvasElement {
  const lines = text.text.split('\n');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `100 ${text.size}px "MangaName Noto Sans", sans-serif`;
  const step = text.size + 2;
  canvas.width = Math.max(1, Math.ceil(text.vertical ? lines.length * step : Math.max(...lines.map(l => [...l].reduce((width, char) => width + ctx.measureText(char).width + 2, -2))) + 2));
  canvas.height = Math.max(1, Math.ceil(text.vertical ? Math.max(...lines.map(l => [...l].length)) * step : lines.length * step));
  if (canvas.width > 2048 || canvas.height > 2048) throw new Error('Number of characters per line is too many.');
  ctx.font = `100 ${text.size}px "MangaName Noto Sans", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000';
  lines.forEach((line, i) => {
    if (text.vertical) [...line].forEach((char, j) => ctx.fillText(char, (lines.length - i - 1) * step, j * step));
    else { let x = 0; for (const char of line) { ctx.fillText(char, x, i * step); x += ctx.measureText(char).width + 2; } }
  });
  return canvas;
}
export async function pageBitmap(page: NativePage, width = PAGE_WIDTH, options: { includePanels?: boolean } = {}): Promise<HTMLCanvasElement> {
  await document.fonts.load('100 16px \"MangaName Noto Sans\"');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(PAGE_HEIGHT * width / PAGE_WIDTH);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(width / PAGE_WIDTH, width / PAGE_WIDTH);
  if (page.bitmap) ctx.drawImage(await loadImage(page.bitmap), 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  page.texts.forEach(t => ctx.drawImage(textBitmap(t), t.x, t.y));
  if (options.includePanels && page.panels) {
    ctx.strokeStyle = '#111';
    ctx.lineWidth = PANEL_BORDER_WIDTH;
    for (const panel of page.panels.panels) ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  }
  return canvas;
}
export function downloadNative(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
