export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1414;
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
export interface NativePage {
  id: string;
  bitmap: string;
  thumbnail: string;
  texts: NativeText[];
}
export interface NativeDraft {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  direction: Direction;
  firstSpread: boolean;
  guide: string;
  pages: NativePage[];
}
export const newNativePage = (): NativePage => ({ id: crypto.randomUUID(), bitmap: '', thumbnail: '', texts: [] });
export function newNativeDraft(title: string): NativeDraft {
  return { id: crypto.randomUUID(), title: title.trim() || 'No Title', createdAt: Date.now(), updatedAt: Date.now(), direction: 'rtl', firstSpread: true, guide: '', pages: [newNativePage()] };
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
export async function pageBitmap(page: NativePage, width = PAGE_WIDTH): Promise<HTMLCanvasElement> {
  await document.fonts.load('100 16px \"MangaName Noto Sans\"');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(PAGE_HEIGHT * width / PAGE_WIDTH);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(width / PAGE_WIDTH, width / PAGE_WIDTH);
  if (page.bitmap) ctx.drawImage(await loadImage(page.bitmap), 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  page.texts.forEach(t => ctx.drawImage(textBitmap(t), t.x, t.y));
  return canvas;
}
export function downloadNative(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
