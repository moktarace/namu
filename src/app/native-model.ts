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
/**
 * The panel sheet is a fixed catalogue. The numbered ids follow the order on
 * the reference sheet: one group per panel count, then left-to-right in each
 * group. Legacy ids remain accepted for old saved projects, but are not shown
 * in the picker.
 */
export type DefinitivePanelTemplate =
  | 'one-1'
  | `two-${1 | 2 | 3 | 4 | 5 | 6}`
  | `three-${1 | 2 | 3 | 4 | 5 | 6}`
  | `four-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `five-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | `six-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | `seven-${1 | 2 | 3 | 4 | 5 | 6 | 7}`
  | `eight-${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
type LegacyPanelTemplate = 'one'
  | 'split-horizontal' | 'split-vertical' | 'two-vertical-left' | 'two-vertical-right' | 'two-horizontal-top' | 'two-horizontal-bottom'
  | 'three-columns' | 'three-rows' | 'large-left' | 'large-right' | 'three-large-top' | 'three-large-bottom'
  | 'grid-2x2' | 'four-columns' | 'four-rows' | 'four-top-wide' | 'four-bottom-wide' | 'four-left-wide' | 'four-right-wide' | 'four-staggered'
  | 'five-left-column' | 'five-right-column' | 'five-top-wide' | 'five-bottom-wide' | 'five-staircase' | 'five-cross'
  | 'grid-3x2' | 'six-rows' | 'six-left-wide' | 'six-right-wide' | 'six-staircase' | 'six-mosaic'
  | 'seven-mosaic' | 'seven-left-column' | 'seven-right-column' | 'seven-top-wide' | 'seven-staircase'
  | 'grid-4x2' | 'eight-rows' | 'eight-brick' | 'eight-mosaic';
export type PanelTemplate = 'none' | DefinitivePanelTemplate | LegacyPanelTemplate;
export interface NativePanelLayout {
  template: Exclude<PanelTemplate, 'none'>;
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
  guide: string;
  pages: NativePage[];
}
export const newNativePage = (): NativePage => ({ id: crypto.randomUUID(), bitmap: '', thumbnail: '', texts: [] });
type PanelPattern = readonly (readonly [number, number, number, number])[];
const p = (x: number, y: number, width: number, height: number): readonly [number, number, number, number] => [x, y, width, height];
const LEGACY_PANEL_PATTERNS: Record<LegacyPanelTemplate, PanelPattern> = {
  one: [p(0, 0, 1, 1)],
  'split-horizontal': [p(0, 0, 1, .48), p(0, .52, 1, .48)],
  'split-vertical': [p(0, 0, .48, 1), p(.52, 0, .48, 1)],
  'two-vertical-left': [p(0, 0, .32, 1), p(.36, 0, .64, 1)],
  'two-vertical-right': [p(0, 0, .64, 1), p(.68, 0, .32, 1)],
  'two-horizontal-top': [p(0, 0, 1, .32), p(0, .36, 1, .64)],
  'two-horizontal-bottom': [p(0, 0, 1, .64), p(0, .68, 1, .32)],
  'three-columns': [p(0, 0, .32, 1), p(.36, 0, .28, 1), p(.68, 0, .32, 1)],
  'three-rows': [p(0, 0, 1, .28), p(0, .34, 1, .32), p(0, .70, 1, .30)],
  'large-left': [p(0, 0, .60, 1), p(.64, 0, .36, .48), p(.64, .52, .36, .48)],
  'large-right': [p(0, 0, .36, .48), p(0, .52, .36, .48), p(.40, 0, .60, 1)],
  'three-large-top': [p(0, 0, 1, .58), p(0, .64, .48, .36), p(.52, .64, .48, .36)],
  'three-large-bottom': [p(0, 0, .48, .36), p(.52, 0, .48, .36), p(0, .42, 1, .58)],
  // Four-panel templates use staggered T-junctions. A four-way central cross
  // gives every panel the same weight and is not a useful manga composition.
  'grid-2x2': [p(0, 0, .56, .40), p(.60, 0, .40, .24), p(.60, .28, .40, .44), p(0, .46, .56, .54)],
  'four-columns': [p(0, 0, .26, .34), p(.30, 0, .70, .34), p(0, .40, .44, .60), p(.48, .40, .52, .60)],
  'four-rows': [p(0, 0, .42, .20), p(.46, 0, .54, .20), p(0, .26, .62, .30), p(0, .64, 1, .36)],
  'four-top-wide': [p(0, 0, 1, .26), p(0, .32, .26, .68), p(.30, .32, .32, .68), p(.66, .32, .34, .68)],
  'four-bottom-wide': [p(0, 0, .24, .62), p(.28, 0, .34, .62), p(.66, 0, .34, .62), p(0, .68, 1, .32)],
  'four-left-wide': [p(0, 0, .28, 1), p(.34, 0, .66, .24), p(.34, .30, .66, .28), p(.34, .64, .66, .36)],
  'four-right-wide': [p(0, 0, .66, .24), p(0, .30, .66, .28), p(0, .64, .66, .36), p(.72, 0, .28, 1)],
  'four-staggered': [p(0, 0, .34, .46), p(.38, 0, .62, .30), p(.38, .34, .30, .66), p(.72, .34, .28, .66)],
  'five-left-column': [p(0, 0, .28, .46), p(0, .52, .28, .48), p(.34, 0, .30, 1), p(.70, 0, .30, .46), p(.70, .52, .30, .48)],
  'five-right-column': [p(0, 0, .30, .46), p(0, .52, .30, .48), p(.36, 0, .30, 1), p(.72, 0, .28, .46), p(.72, .52, .28, .48)],
  'five-top-wide': [p(0, 0, .30, .28), p(.35, 0, .30, .28), p(.70, 0, .30, .28), p(0, .34, .48, .66), p(.52, .34, .48, .66)],
  'five-bottom-wide': [p(0, 0, .48, .66), p(.52, 0, .48, .66), p(0, .72, .30, .28), p(.35, .72, .30, .28), p(.70, .72, .30, .28)],
  'five-staircase': [p(0, 0, .32, .28), p(.36, 0, .64, .28), p(0, .34, .30, .30), p(.34, .34, .32, .30), p(0, .68, 1, .32)],
  'five-cross': [p(0, 0, .48, .28), p(.52, 0, .48, .28), p(0, .34, .62, .30), p(.66, .34, .34, .66), p(0, .68, .62, .32)],
  'grid-3x2': [p(0, 0, .32, .48), p(.36, 0, .28, .48), p(.68, 0, .32, .48), p(0, .52, .32, .48), p(.36, .52, .28, .48), p(.68, .52, .32, .48)],
  'six-rows': [p(0, 0, 1, .14), p(0, .17, 1, .14), p(0, .34, 1, .14), p(0, .51, 1, .14), p(0, .68, 1, .14), p(0, .85, 1, .15)],
  'six-left-wide': [p(0, 0, .32, .48), p(0, .52, .32, .48), p(.36, 0, .64, .30), p(.36, .34, .30, .66), p(.70, .34, .30, .30), p(.70, .68, .30, .32)],
  'six-right-wide': [p(0, 0, .64, .30), p(.70, 0, .30, .48), p(0, .34, .30, .30), p(.34, .34, .30, .30), p(0, .68, .64, .32), p(.70, .52, .30, .48)],
  'six-staircase': [p(0, 0, .48, .28), p(.52, 0, .48, .28), p(0, .34, .30, .28), p(.34, .34, .66, .28), p(0, .68, .62, .32), p(.66, .68, .34, .32)],
  'six-mosaic': [p(0, 0, .32, .32), p(.36, 0, .64, .32), p(0, .36, .48, .28), p(.52, .36, .48, .28), p(0, .68, .64, .32), p(.68, .68, .32, .32)],
  'seven-mosaic': [p(0, 0, .30, .28), p(.34, 0, .30, .28), p(.68, 0, .32, .28), p(0, .34, .48, .28), p(.52, .34, .48, .28), p(0, .68, .32, .32), p(.36, .68, .64, .32)],
  'seven-left-column': [p(0, 0, .28, .32), p(0, .36, .28, .28), p(0, .68, .28, .32), p(.32, 0, .32, .48), p(.68, 0, .32, .28), p(.32, .52, .32, .48), p(.68, .32, .32, .68)],
  'seven-right-column': [p(.72, 0, .28, .32), p(.72, .36, .28, .28), p(.72, .68, .28, .32), p(.36, 0, .32, .48), p(0, 0, .32, .28), p(.36, .52, .32, .48), p(0, .32, .32, .68)],
  'seven-top-wide': [p(0, 0, 1, .26), p(0, .30, .30, .32), p(.34, .30, .30, .32), p(.68, .30, .32, .32), p(0, .66, .48, .34), p(.52, .66, .22, .34), p(.78, .66, .22, .34)],
  'seven-staircase': [p(0, 0, .32, .30), p(.36, 0, .64, .30), p(0, .34, .32, .30), p(.36, .34, .32, .30), p(.72, .34, .28, .30), p(0, .68, .62, .32), p(.66, .68, .34, .32)],
  'grid-4x2': [p(0, 0, .23, .48), p(.27, 0, .23, .48), p(.54, 0, .23, .48), p(.81, 0, .19, .48), p(0, .52, .23, .48), p(.27, .52, .23, .48), p(.54, .52, .23, .48), p(.81, .52, .19, .48)],
  'eight-rows': [p(0, 0, 1, .105), p(0, .125, 1, .105), p(0, .25, 1, .105), p(0, .375, 1, .105), p(0, .50, 1, .105), p(0, .625, 1, .105), p(0, .75, 1, .105), p(0, .875, 1, .125)],
  'eight-brick': [p(0, 0, .24, .24), p(.28, 0, .24, .24), p(.56, 0, .44, .24), p(0, .28, .44, .24), p(.48, .28, .52, .24), p(0, .56, .32, .44), p(.36, .56, .32, .44), p(.72, .56, .28, .44)],
  'eight-mosaic': [p(0, 0, .32, .24), p(.36, 0, .30, .24), p(.70, 0, .30, .24), p(0, .28, .48, .30), p(.52, .28, .48, .30), p(0, .64, .32, .36), p(.36, .64, .30, .36), p(.70, .64, .30, .36)],
};
/** Normalised layouts transcribed from the definitive reference sheet. */
const DEFINITIVE_PANEL_PATTERNS: Record<DefinitivePanelTemplate, PanelPattern> = {
  'one-1': [p(0, 0, 1, 1)],

  'two-1': [p(0, 0, .32, 1), p(.38, 0, .62, 1)],
  'two-2': [p(0, 0, .62, 1), p(.68, 0, .32, 1)],
  'two-3': [p(0, 0, .48, 1), p(.54, 0, .46, 1)],
  'two-4': [p(0, 0, 1, .30), p(0, .38, 1, .62)],
  'two-5': [p(0, 0, 1, .58), p(0, .66, 1, .34)],
  'two-6': [p(0, 0, 1, .42), p(0, .50, 1, .50)],

  'three-1': [p(0, 0, .26, 1), p(.32, 0, .34, 1), p(.74, 0, .26, 1)],
  // The six three-panel sketches use the two-column and two-row T-junctions
  // from the sheet; they are deliberately different from a uniform grid.
  'three-2': [p(0, 0, .34, .46), p(0, .54, .34, .46), p(.40, 0, .60, 1)],
  'three-3': [p(0, 0, .60, 1), p(.66, 0, .34, .46), p(.66, .54, .34, .46)],
  'three-4': [p(0, 0, 1, .52), p(0, .58, .48, .42), p(.54, .58, .46, .42)],
  'three-5': [p(0, 0, .48, .42), p(.54, 0, .46, .42), p(0, .48, 1, .52)],
  'three-6': [p(0, 0, 1, .28), p(0, .36, 1, .28), p(0, .72, 1, .28)],

  // Four-panel row: the first sketch is the four horizontal strips on the
  // previous line, followed by the eight staggered drawings below it.
  'four-1': [p(0, 0, 1, .16), p(0, .22, 1, .20), p(0, .48, 1, .20), p(0, .74, 1, .26)],
  'four-2': [p(0, 0, .46, .42), p(.52, 0, .48, .50), p(0, .50, .46, .50), p(.52, .58, .48, .42)],
  'four-3': [p(0, 0, .30, .50), p(.35, 0, .30, .50), p(.70, 0, .30, .50), p(0, .56, 1, .44)],
  'four-4': [p(0, 0, 1, .34), p(0, .40, .30, .60), p(.35, .40, .30, .60), p(.70, .40, .30, .60)],
  'four-5': [p(0, 0, .42, .30), p(.48, 0, .52, .56), p(0, .36, .42, .20), p(0, .62, 1, .38)],
  'four-6': [p(0, 0, .58, .52), p(.64, 0, .36, .30), p(.64, .36, .36, .18), p(0, .62, 1, .38)],
  'four-7': [p(0, 0, 1, .28), p(0, .34, 1, .24), p(0, .64, .46, .36), p(.52, .64, .48, .36)],
  'four-8': [p(0, 0, 1, .28), p(0, .34, .46, .26), p(.52, .34, .48, .26), p(0, .66, 1, .34)],
  'four-9': [p(0, 0, .46, .26), p(.52, 0, .48, .26), p(0, .34, 1, .26), p(0, .66, 1, .34)],

  'five-1': [p(0, 0, .46, .32), p(.52, 0, .48, .32), p(0, .38, .30, .24), p(.36, .38, .64, .24), p(0, .68, 1, .32)],
  'five-2': [p(0, 0, 1, .25), p(0, .31, .46, .28), p(.52, .31, .48, .28), p(0, .65, .52, .35), p(.58, .65, .42, .35)],
  'five-3': [p(0, 0, .30, .28), p(.35, 0, .30, .28), p(.70, 0, .30, .28), p(0, .34, 1, .24), p(0, .64, 1, .36)],
  'five-4': [p(0, 0, .30, .20), p(0, .25, .30, .20), p(0, .50, .30, .22), p(.36, 0, .64, .72), p(0, .78, 1, .22)],
  'five-5': [p(0, 0, .28, .30), p(.34, 0, .30, .30), p(.70, 0, .30, .30), p(0, .36, 1, .24), p(0, .68, 1, .32)],
  'five-6': [p(0, 0, .42, .28), p(.48, 0, .52, .28), p(0, .34, .42, .28), p(.48, .34, .52, .28), p(0, .68, 1, .32)],
  'five-7': [p(0, 0, .28, 1), p(.34, 0, .30, .46), p(.34, .52, .30, .48), p(.70, 0, .30, .46), p(.70, .52, .30, .48)],
  'five-8': [p(0, 0, 1, .28), p(0, .34, .46, .28), p(.52, .34, .48, .28), p(0, .68, .30, .32), p(.36, .68, .64, .32)],

  'six-1': [p(0, 0, .24, 1), p(.30, 0, .32, .28), p(.68, 0, .32, .28), p(.30, .34, .32, .28), p(.68, .34, .32, .28), p(.30, .68, .70, .32)],
  'six-2': [p(0, 0, .46, .28), p(.52, 0, .48, .28), p(0, .34, .30, .28), p(.36, .34, .64, .28), p(0, .68, .46, .32), p(.52, .68, .48, .32)],
  'six-3': [p(0, 0, .30, .28), p(.35, 0, .30, .28), p(.70, 0, .30, .28), p(0, .34, 1, .24), p(0, .64, .46, .36), p(.52, .64, .48, .36)],
  'six-4': [p(0, 0, .28, .28), p(0, .34, .28, .28), p(0, .68, .28, .32), p(.34, 0, .30, .46), p(.34, .52, .30, .48), p(.70, 0, .30, 1)],
  'six-5': [p(0, 0, .64, .26), p(.70, 0, .30, .26), p(0, .32, .30, .28), p(.36, .32, .64, .28), p(0, .66, .46, .34), p(.52, .66, .48, .34)],
  'six-6': [p(0, 0, 1, .22), p(0, .28, .46, .26), p(.52, .28, .48, .26), p(0, .62, .30, .38), p(.36, .62, .30, .38), p(.72, .62, .28, .38)],
  'six-7': [p(0, 0, .30, .28), p(.36, 0, .64, .28), p(0, .34, .46, .28), p(.52, .34, .48, .28), p(0, .68, .30, .32), p(.36, .68, .64, .32)],
  'six-8': [p(0, 0, .28, 1), p(.34, 0, .30, .46), p(.34, .52, .30, .48), p(.70, 0, .30, .28), p(.70, .34, .30, .28), p(.70, .68, .30, .32)],

  'seven-1': [p(0, 0, .30, .28), p(.35, 0, .30, .28), p(.70, 0, .30, .28), p(0, .34, .46, .28), p(.52, .34, .48, .28), p(0, .68, .30, .32), p(.36, .68, .64, .32)],
  'seven-2': [p(0, 0, .26, .28), p(0, .34, .26, .28), p(0, .68, .26, .32), p(.32, 0, .30, .46), p(.32, .52, .30, .48), p(.68, 0, .32, .46), p(.68, .52, .32, .48)],
  'seven-3': [p(.74, 0, .26, .28), p(.74, .34, .26, .28), p(.74, .68, .26, .32), p(.38, 0, .30, .46), p(.38, .52, .30, .48), p(0, 0, .32, .46), p(0, .52, .32, .48)],
  'seven-4': [p(0, 0, 1, .24), p(0, .30, .30, .30), p(.35, .30, .30, .30), p(.70, .30, .30, .30), p(0, .66, .30, .34), p(.35, .66, .30, .34), p(.70, .66, .30, .34)],
  'seven-5': [p(0, 0, .30, .30), p(.36, 0, .64, .30), p(0, .34, .30, .30), p(.36, .34, .30, .30), p(.72, .34, .28, .30), p(0, .68, .46, .32), p(.52, .68, .48, .32)],
  'seven-6': [p(0, 0, .42, .28), p(.48, 0, .52, .28), p(0, .34, .30, .28), p(.36, .34, .30, .28), p(.72, .34, .28, .28), p(0, .68, .46, .32), p(.52, .68, .48, .32)],
  'seven-7': [p(0, 0, .24, .46), p(0, .52, .24, .48), p(.30, 0, .32, .28), p(.68, 0, .32, .28), p(.30, .34, .32, .28), p(.68, .34, .32, .28), p(.30, .68, .70, .32)],

  'eight-1': [p(0, 0, .30, .26), p(.35, 0, .30, .26), p(.70, 0, .30, .26), p(0, .32, 1, .22), p(0, .60, .22, .40), p(.28, .60, .22, .40), p(.56, .60, .22, .40), p(.84, .60, .16, .40)],
  'eight-2': [p(0, 0, 1, .18), p(0, .24, 1, .18), p(0, .48, .30, .24), p(.36, .48, .30, .24), p(.72, .48, .28, .24), p(0, .76, .30, .24), p(.36, .76, .30, .24), p(.72, .76, .28, .24)],
  'eight-3': [p(0, 0, .24, .28), p(.30, 0, .22, .28), p(.58, 0, .42, .28), p(0, .34, .46, .26), p(.52, .34, .48, .26), p(0, .66, .30, .34), p(.36, .66, .30, .34), p(.72, .66, .28, .34)],
  'eight-4': [p(0, 0, .32, .22), p(.38, 0, .30, .22), p(.74, 0, .30, .22), p(0, .28, .46, .22), p(.52, .28, .48, .22), p(0, .56, .30, .44), p(.36, .56, .30, .44), p(.72, .56, .28, .44)],
  // The last three eight-panel sketches are the horizontal, hand-drawn T
  // layouts at the bottom of the sheet rather than regular 4×2 grids.
  'eight-5': [p(0, 0, .30, .20), p(.35, 0, .30, .20), p(.70, 0, .30, .20), p(0, .26, 1, .18), p(0, .50, 1, .18), p(0, .74, .30, .26), p(.35, .74, .30, .26), p(.70, .74, .30, .26)],
  'eight-6': [p(0, 0, .46, .20), p(.52, 0, .48, .20), p(0, .26, 1, .18), p(0, .50, .30, .18), p(.36, .50, .30, .18), p(.72, .50, .28, .18), p(0, .74, .46, .26), p(.52, .74, .48, .26)],
  'eight-7': [p(0, 0, .46, .20), p(.52, 0, .48, .20), p(0, .26, 1, .18), p(0, .50, .46, .18), p(.52, .50, .48, .18), p(0, .74, .30, .26), p(.35, .74, .30, .26), p(.70, .74, .30, .26)],
};

const PANEL_PATTERNS: Record<string, PanelPattern> = { ...LEGACY_PANEL_PATTERNS, ...DEFINITIVE_PANEL_PATTERNS };

/** Exactly 52 page templates from the reference sheet (1 + 6 + 6 + 9 + 8 + 8 + 7 + 7). */
export const PANEL_TEMPLATES: readonly (readonly [DefinitivePanelTemplate, string, number])[] = [
  ['one-1', '1 panel · Template 1', 1],
  ...Array.from({ length: 6 }, (_, i) => [`two-${i + 1}` as DefinitivePanelTemplate, `2 panels · Template ${i + 1}`, 2] as const),
  ...Array.from({ length: 6 }, (_, i) => [`three-${i + 1}` as DefinitivePanelTemplate, `3 panels · Template ${i + 1}`, 3] as const),
  ...Array.from({ length: 9 }, (_, i) => [`four-${i + 1}` as DefinitivePanelTemplate, `4 panels · Template ${i + 1}`, 4] as const),
  ...Array.from({ length: 8 }, (_, i) => [`five-${i + 1}` as DefinitivePanelTemplate, `5 panels · Template ${i + 1}`, 5] as const),
  ...Array.from({ length: 8 }, (_, i) => [`six-${i + 1}` as DefinitivePanelTemplate, `6 panels · Template ${i + 1}`, 6] as const),
  ...Array.from({ length: 7 }, (_, i) => [`seven-${i + 1}` as DefinitivePanelTemplate, `7 panels · Template ${i + 1}`, 7] as const),
  ...Array.from({ length: 7 }, (_, i) => [`eight-${i + 1}` as DefinitivePanelTemplate, `8 panels · Template ${i + 1}`, 8] as const),
];
/**
 * The reference sheet uses compact manga gutters. The source patterns keep a
 * small normalised gap to describe their T-junctions; this pass compresses
 * that drawing gap to 35% before the physical gutter is applied. It prevents
 * the preview and the page guides from turning into oversized comic-book
 * gutters while preserving each template's composition.
 */
function compactPanelGaps(panels: NativePanel[], factor = .35): NativePanel[] {
  const compacted = panels.map(panel => ({ ...panel }));
  const hasOverlap = (): boolean => compacted.some((a, i) => compacted.some((b, j) => {
    if (j <= i) return false;
    return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .01
      && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .01;
  }));
  const safeAdjust = (adjust: () => void): void => {
    const snapshot = compacted.map(panel => ({ ...panel }));
    adjust();
    if (hasOverlap()) snapshot.forEach((panel, index) => Object.assign(compacted[index], panel));
  };
  for (let i = 0; i < compacted.length; i++) for (let j = i + 1; j < compacted.length; j++) {
    const a = compacted[i], b = compacted[j];
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    const betweenX = (left: NativePanel, right: NativePanel): boolean => compacted.some((candidate, index) => {
      if (index === i || index === j) return false;
      const candidateOverlapY = Math.min(candidate.y + candidate.height, right.y + right.height, left.y + left.height)
        - Math.max(candidate.y, right.y, left.y);
      return candidateOverlapY > 0 && candidate.x >= left.x + left.width && candidate.x + candidate.width <= right.x;
    });
    const betweenY = (top: NativePanel, bottom: NativePanel): boolean => compacted.some((candidate, index) => {
      if (index === i || index === j) return false;
      const candidateOverlapX = Math.min(candidate.x + candidate.width, bottom.x + bottom.width, top.x + top.width)
        - Math.max(candidate.x, bottom.x, top.x);
      return candidateOverlapX > 0 && candidate.y >= top.y + top.height && candidate.y + candidate.height <= bottom.y;
    });
    if (overlapY > 0 && a.x + a.width <= b.x && !betweenX(a, b)) {
      const gap = b.x - (a.x + a.width), reduce = gap * (1 - factor) / 2;
      safeAdjust(() => { a.width += reduce; b.x -= reduce; b.width += reduce; });
    } else if (overlapY > 0 && b.x + b.width <= a.x && !betweenX(b, a)) {
      const gap = a.x - (b.x + b.width), reduce = gap * (1 - factor) / 2;
      safeAdjust(() => { b.width += reduce; a.x -= reduce; a.width += reduce; });
    }
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    if (overlapX > 0 && a.y + a.height <= b.y && !betweenY(a, b)) {
      const gap = b.y - (a.y + a.height), reduce = gap * (1 - factor) / 2;
      safeAdjust(() => { a.height += reduce; b.y -= reduce; b.height += reduce; });
    } else if (overlapX > 0 && b.y + b.height <= a.y && !betweenY(b, a)) {
      const gap = a.y - (b.y + b.height), reduce = gap * (1 - factor) / 2;
      safeAdjust(() => { b.height += reduce; a.y -= reduce; a.height += reduce; });
    }
  }
  return compacted;
}

/** Keep panels that share a horizontal tier at the same height. */
function equalizeRowHeights(panels: NativePanel[]): NativePanel[] {
  const rows: NativePanel[][] = [];
  const rowTolerance = 1;
  for (const panel of panels) {
    // A panel that spans nearly the whole page is a vertical anchor, not a
    // member of one of the shorter horizontal tiers beside it.
    if (panel.height >= PAGE_HEIGHT * .82) continue;
    const row = rows.find(candidate => Math.abs(candidate[0].y - panel.y) <= rowTolerance);
    if (row) row.push(panel); else rows.push([panel]);
  }
  for (const row of rows) if (row.length > 1) {
    const height = Math.min(...row.map(panel => panel.height));
    row.forEach(panel => { panel.height = height; });
  }
  return panels;
}

export function panelLayout(template: Exclude<PanelTemplate, 'none'>, margin = 70, gutter = 14): NativePanelLayout {
  // Manga layouts conventionally use a narrower vertical gutter and a wider
  // horizontal gutter so adjacent panels read as a row before the eye drops.
  const verticalGutter = Math.max(4, Math.round(gutter * .75));
  const horizontalGutter = Math.max(verticalGutter + 4, Math.round(gutter * 1.33));
  const width = PAGE_WIDTH - margin * 2, height = PAGE_HEIGHT - margin * 2, insetX = verticalGutter / 2, insetY = horizontalGutter / 2;
  const panels = equalizeRowHeights(compactPanelGaps(PANEL_PATTERNS[template].map(([x, y, panelWidth, panelHeight]) => ({
    x: margin + x * width + (x > 0 ? insetX : 0),
    y: margin + y * height + (y > 0 ? insetY : 0),
    width: panelWidth * width - (x > 0 ? insetX : 0) - (x + panelWidth < 1 ? insetX : 0),
    height: panelHeight * height - (y > 0 ? insetY : 0) - (y + panelHeight < 1 ? insetY : 0),
  }))));
  return { template, margin, gutter, verticalGutter, horizontalGutter, panels };
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
