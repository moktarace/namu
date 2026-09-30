import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NativePage, NativePanelLayout, NativeText, NativeTool, PAGE_HEIGHT, PAGE_WIDTH, loadImage, mergePanels, nativeImage, panelLayout, splitPanel, textBitmap } from './native-model';

interface Point { x: number; y: number }
interface PaintBounds { x: number; y: number; width: number; height: number }
interface Frame { bitmap: string; texts: NativeText[]; panels: NativePanelLayout | null }
interface SelectedText { text: NativeText; offsetX: number; offsetY: number }
interface Selection { src: string; x: number; y: number; width: number; height: number; rotation: number; flip: boolean; lasso: boolean; outline?: string; textItems?: SelectedText[] }
interface PanelCutPreview { panelIndex: number; orientation: 'vertical' | 'horizontal'; position: number }
const MAX_HISTORY_FRAMES = 16;
@Component({
  selector: 'native-editor', standalone: true, imports: [FormsModule],
  templateUrl: './native-editor.html', styleUrl: './native-editor.scss',
  host: {
    '[style.--bar-size.px]': 'barThickness',
    '[style.--tool-container-size.px]': 'toolContainerSize',
    '[style.--indicator-size.px]': 'dp(10)',
    '[style.--indicator-offset.px]': 'dp(34)',
    '[style.--native-unit.px]': 'dp(1)',
  },
})
export class NativeEditor implements AfterViewInit, OnDestroy {
  @Input({ required: true }) page!: NativePage;
  @Input() title = '';
  @Input() pageNumber = 1;
  @Input() pageCount = 1;
  @Input() guide = '';
  @Input() leftHanded = false;
  @Input() volumeControl = 'none';
  @Output() pageSave = new EventEmitter<NativePage>();
  @Output() navigate = new EventEmitter<number>();
  @Output() message = new EventEmitter<string>();
  @ViewChild('paint', { static: true }) paint!: ElementRef<HTMLCanvasElement>;
  @ViewChild('stage', { static: true }) stage!: ElementRef<HTMLElement>;
  @ViewChild('floating', { static: true }) floating!: ElementRef<HTMLElement>;
  @ViewChild('editorDialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  readonly image = nativeImage;
  readonly density = window.devicePixelRatio || 1;
  // Android rounds each resource dimension before measuring the RelativeLayout.
  readonly toolContainerSize = this.dp(34) + this.dp(10);
  readonly barThickness = this.dp(4) * 2 + this.toolContainerSize;
  dp(value: number): number { return Math.round(value * this.density) / this.density; }
  readonly tools: NativeTool[] = ['pen', 'eraser', 'line', 'rect', 'text', 'stamp', 'lasso'];
  readonly labels = { pen: 'Pen', eraser: 'Eraser', line: 'Line', rect: 'Rectangle', text: 'Text', stamp: 'Stamp', lasso: 'Lasso' };
  readonly toolShortcuts: Record<NativeTool, string> = { pen: 'B', eraser: 'E', line: 'L', rect: 'R', text: 'T', stamp: 'S', lasso: 'Q' };
  readonly colors = ['#000000', '#7dbeff', '#f44336', '#4caf50', '#d1d1d1'];
  readonly tool = signal<NativeTool>('pen');
  readonly widths = computed(() => this.tool() === 'eraser' ? [8, 30, 200] : [2, 4, 6, 8, 12, 30]);
  readonly properties = signal<Record<string, { size: number; color: string }>>({ pen: { size: 2, color: '#000000' }, eraser: { size: 30, color: '#000000' }, line: { size: 2, color: '#000000' }, rect: { size: 2, color: '#000000' } });
  readonly property = computed(() => this.properties()[this.tool()] || { size: 2, color: '#000000' });
  readonly dirty = signal(false);
  readonly busy = signal(true);
  readonly saving = signal(false);
  readonly autoSavePending = signal(false);
  readonly saveLabel = computed(() => this.saving() ? 'Saving…' : this.dirty() ? (this.autoSavePending() ? 'Autosave pending' : 'Unsaved changes') : 'Saved');
  readonly undoCount = signal(0);
  readonly redoCount = signal(0);
  readonly texts = signal<NativeText[]>([]);
  readonly selectedText = signal<string | null>(null);
  readonly selection = signal<Selection | null>(null);
  readonly fullScreen = signal(false);
  readonly panelEditMode = signal(false);
  readonly panelCutPreview = signal<PanelCutPreview | null>(null);
  readonly panelActionLabel = computed(() => this.panelEditMode() ? 'Finish panel editing' : this.panelLayout() ? 'Edit panels' : 'Panels');
  readonly verticalBar = signal(true);
  readonly bar = signal({ x: 0, y: 1 / this.density });
  readonly view = signal({ x: 0, y: 0, scale: 1, rotation: 0 });
  readonly dialogType = signal<'tool' | 'text' | 'clear' | 'leave' | null>(null);
  readonly panelLayout = signal<NativePanelLayout | null>(null);
  readonly stampOpen = signal(true);
  readonly stampTab = signal<'mark' | 'face'>('mark');
  readonly stamps = computed(() => this.stampTab() === 'mark'
    ? [...Array.from({ length: 20 }, (_, i) => `stamp_icon_${String(i + 1).padStart(3, '0')}`), 'stamp_icon_fukidasi', 'stamp_icon_fukidasi2']
    : Array.from({ length: 30 }, (_, i) => ['m', 'f'].map(sex => `stamp_face_${sex}_${String(i + 1).padStart(3, '0')}`)).flat());
  textValue = ''; textSize = 16; textVertical = true;
  private textPosition: Point = { x: 0, y: 0 };
  private editingText: string | null = null;
  private frames: Frame[] = [];
  private cursor = 0;
  private savedFrame?: Frame;
  private ctx!: CanvasRenderingContext2D;
  private resizeObserver?: ResizeObserver;
  private stroke: Point[] = [];
  private strokeBefore?: ImageData;
  private previewBounds?: PaintBounds;
  private renderedPointCount = 0;
  private pointers = new Map<number, Point>();
  private gesture?: { distance: number; angle: number; center: Point; view: { x: number; y: number; scale: number; rotation: number } };
  private pendingNavigation = -1;
  private objectDrag?: { id: number; mode: string; start: Point; original: Selection; text?: NativeText; editOnTap: boolean; moved: boolean };
  private barDrag?: { id: number; x: number; y: number; original: Point };
  private textImages = new Map<string, { src: string; width: number; height: number }>();
  private destroyed = false;
  private speechAbort?: () => void;
  private panelStroke: Point[] = [];
  private panelPointerId?: number;
  private lastPanelTap?: { x: number; y: number; time: number; pair: string };
  private autoSaveTimer?: ReturnType<typeof setTimeout>;
  private dialogReturnFocus?: HTMLElement;
  private requestRevision = 0;
  private captureDown = (e: PointerEvent): void => {
    if (this.busy() || e.button !== 0 || (e.target as HTMLElement).closest('button,.floating-bar,.stamp-panel')) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size < 2) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const drag = this.objectDrag;
    if (drag?.text) this.texts.update(texts => texts.map(t => t.id === drag.text!.id ? drag.text! : t));
    else if (drag) this.selection.set(drag.original);
    this.objectDrag = undefined;
    for (const pointerId of this.pointers.keys()) this.stage.nativeElement.setPointerCapture(pointerId);
    this.beginGesture();
  };
  private captureMove = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.gesture) return;
    e.preventDefault(); e.stopImmediatePropagation(); this.pointerMove(e);
  };
  private captureUp = (e: PointerEvent): void => {
    if (this.gesture) { e.stopImmediatePropagation(); this.pointerUp(e); }
    else this.pointers.delete(e.pointerId);
  };

  async ngAfterViewInit(): Promise<void> {
    this.ctx = this.paint.nativeElement.getContext('2d', { willReadFrequently: true })!;
    const stage = this.stage.nativeElement;
    stage.addEventListener('pointerdown', this.captureDown, true);
    stage.addEventListener('pointermove', this.captureMove, true);
    stage.addEventListener('pointerup', this.captureUp, true);
    stage.addEventListener('pointercancel', this.captureUp, true);
    try {
      await document.fonts.load('100 16px \"Namu Noto Sans\"');
      const stored = localStorage.getItem('manganame-tools');
      if (stored) {
        const value = JSON.parse(stored);
        for (const name of ['pen', 'eraser', 'line', 'rect']) {
          const p = value[name];
          if (p && Number.isFinite(p.size) && p.size > 0 && p.size <= 200 && this.colors.includes(p.color)) this.properties.update(v => ({ ...v, [name]: p }));
        }
      }
      this.verticalBar.set(localStorage.getItem('manganame-toolbar-vertical') !== 'false');
      if (this.page.bitmap) this.ctx.drawImage(await loadImage(this.page.bitmap), 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      this.texts.set(structuredClone(this.page.texts));
      const savedPanels = this.page.panels;
      if (savedPanels) {
        const layout = structuredClone(savedPanels);
        layout.template = 'one';
        layout.verticalGutter ??= Math.max(4, Math.round(layout.gutter * .75));
        layout.horizontalGutter ??= Math.max(layout.verticalGutter + 4, Math.round(layout.gutter * 1.33));
        this.panelLayout.set(layout);
      } else this.panelLayout.set(null);
      this.frames = [this.frame()]; this.savedFrame = this.frames[0];
      this.saving.set(false); this.autoSavePending.set(false);
      this.fit();
      if (this.leftHanded) this.bar.set({ x: Math.max(0, this.stage.nativeElement.clientWidth - this.floating.nativeElement.offsetWidth), y: 1 / this.density });
      let stageWidth = stage.clientWidth;
      this.resizeObserver = new ResizeObserver(() => {
        // Native layout changes (fullscreen/keyboard) retain the canvas matrix.
        // A width change represents a new viewport/orientation and needs a fit.
        if (stage.clientWidth !== stageWidth) { stageWidth = stage.clientWidth; this.fit(); }
        else this.clampBar();
      });
      this.resizeObserver.observe(this.stage.nativeElement);
    } catch { this.message.emit('Failed to load the page.'); }
    this.busy.set(false);
  }
  ngOnDestroy(): void {
    this.destroyed = true; this.cancelAutoSave(); this.resizeObserver?.disconnect(); this.speechAbort?.();
    const stage = this.stage.nativeElement;
    stage.removeEventListener('pointerdown', this.captureDown, true);
    stage.removeEventListener('pointermove', this.captureMove, true);
    stage.removeEventListener('pointerup', this.captureUp, true);
    stage.removeEventListener('pointercancel', this.captureUp, true);
  }
  fit(): void {
    const r = this.stage.nativeElement.getBoundingClientRect();
    const portrait = window.innerHeight >= window.innerWidth;
    // y.m() mixes Android dp controls with 20 physical-pixel canvas margins.
    const density = window.devicePixelRatio || 1, margin = 20 / density;
    const inset = portrait ? this.barThickness : 0;
    const width = Math.max(1, r.width - (this.verticalBar() ? inset + 2 * margin : 0));
    const height = Math.max(1, r.height - inset - 2 * margin);
    const scale = Math.min(width / PAGE_WIDTH, height / PAGE_HEIGHT);
    const left = portrait && this.verticalBar() ? (this.leftHanded ? margin : this.barThickness + margin) : (width - Math.floor(scale * PAGE_WIDTH * density) / density) / 2;
    const top = (portrait ? (this.verticalBar() ? this.dp(48) + this.dp(4) : this.barThickness + 1 / density) : 0) + margin;
    this.view.set({ x: left + PAGE_WIDTH * scale / 2, y: top + PAGE_HEIGHT * scale / 2, scale, rotation: 0 });
    this.clampBar();
  }
  private clampBar(): void {
    const r = this.stage.nativeElement, b = this.bar(), f = this.floating.nativeElement;
    this.bar.set({ x: Math.min(b.x, Math.max(0, r.clientWidth - f.offsetWidth)), y: Math.min(b.y, Math.max(0, r.clientHeight - f.offsetHeight)) });
  }
  paperTransform(): string {
    const v = this.view();
    return `translate(${v.x}px, ${v.y}px) rotate(${v.rotation}rad) scale(${v.scale}) translate(-50%, -50%)`;
  }
  private toPage(clientX: number, clientY: number): Point {
    const r = this.stage.nativeElement.getBoundingClientRect(), v = this.view();
    const x = clientX - r.left - v.x, y = clientY - r.top - v.y;
    return { x: (x * Math.cos(v.rotation) + y * Math.sin(v.rotation)) / v.scale + PAGE_WIDTH / 2, y: (-x * Math.sin(v.rotation) + y * Math.cos(v.rotation)) / v.scale + PAGE_HEIGHT / 2 };
  }
  async openTool(): Promise<void> { if (this.busy()) return; await this.commitSelection(); this.selectedText.set(null); this.openDialog('tool'); }
  chooseTool(tool: NativeTool): void {
    this.tool.set(tool);
    if (['text', 'stamp', 'lasso'].includes(tool)) this.closeDialog();
    if (tool === 'stamp') { this.stampOpen.set(true); this.stampTab.set('mark'); }
  }
  setProperty(kind: 'size' | 'color', value: number | string): void {
    this.properties.update(p => ({ ...p, [this.tool()]: { ...this.property(), [kind]: value } }));
    localStorage.setItem('manganame-tools', JSON.stringify(this.properties()));
  }
  rotateBar(): void {
    this.verticalBar.update(v => !v);
    localStorage.setItem('manganame-toolbar-vertical', String(this.verticalBar()));
    requestAnimationFrame(() => this.clampBar());
  }
  barDown(e: PointerEvent): void {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.barDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, original: this.bar() };
  }
  barMove(e: PointerEvent): void {
    if (!this.barDrag || e.pointerId !== this.barDrag.id) return;
    const b = this.barDrag, r = this.stage.nativeElement, f = this.floating.nativeElement;
    this.bar.set({ x: Math.max(0, Math.min(r.clientWidth - f.offsetWidth, b.original.x + e.clientX - b.x)), y: Math.max(0, Math.min(r.clientHeight - f.offsetHeight, b.original.y + e.clientY - b.y)) });
  }
  barUp(): void { this.barDrag = undefined; }
  private beginGesture(): void {
    if (this.strokeBefore) this.ctx.putImageData(this.strokeBefore, 0, 0);
    this.stroke = []; this.strokeBefore = undefined; this.previewBounds = undefined; this.renderedPointCount = 0; this.clearLasso();
    const [a, b] = [...this.pointers.values()];
    this.gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...this.view() } };
  }
  pointerDown(e: PointerEvent): void {
    if (this.busy() || e.button !== 0 || (e.target as HTMLElement).closest('button,.floating-bar,.stamp-panel,.panel-edit-overlay,.selection,.editable-text')) return;
    e.preventDefault(); this.stage.nativeElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size > 1) {
      this.beginGesture(); return;
    }
    if (this.selection()) { void this.commitSelection(); return; }
    if (this.selectedText()) { this.selectedText.set(null); return; }
    const p = this.toPage(e.clientX, e.clientY);
    if (this.tool() === 'text') {
      if (p.x >= 0 && p.y >= 0 && p.x <= PAGE_WIDTH && p.y <= PAGE_HEIGHT) this.editText(p);
      return;
    }
    if (this.tool() === 'stamp') { this.stampOpen.set(true); return; }
    this.stroke = [p];
    this.strokeBefore = this.ctx.getImageData(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    this.previewBounds = undefined; this.renderedPointCount = 0;
    this.renderStroke();
  }
  pointerMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.gesture && this.pointers.size > 1) {
      const [a, b] = [...this.pointers.values()], g = this.gesture, r = this.stage.nativeElement.getBoundingClientRect();
      const factor = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(g.distance, 1);
      const scale = Math.max(0.08, Math.min(8, g.view.scale * factor));
      const angle = Math.atan2(b.y - a.y, b.x - a.x) - g.angle;
      const dx = g.view.x - (g.center.x - r.left), dy = g.view.y - (g.center.y - r.top);
      const ratio = scale / g.view.scale;
      this.view.set({ x: (a.x + b.x) / 2 - r.left + (dx * Math.cos(angle) - dy * Math.sin(angle)) * ratio, y: (a.y + b.y) / 2 - r.top + (dx * Math.sin(angle) + dy * Math.cos(angle)) * ratio, scale, rotation: g.view.rotation + angle });
      return;
    }
    if (!this.stroke.length || this.gesture) return;
    const points = e.getCoalescedEvents?.() || [e];
    for (const event of points.length ? points : [e]) {
      const p = this.toPage(event.clientX, event.clientY), last = this.stroke.at(-1)!;
      if (Math.abs(p.x - last.x) >= 1 || Math.abs(p.y - last.y) >= 1) this.stroke.push(p);
    }
    this.renderStroke();
  }
  pointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.gesture) { if (!this.pointers.size) this.gesture = undefined; return; }
    if (!this.stroke.length) return;
    if (e.type === 'pointercancel') {
      if (this.strokeBefore) this.ctx.putImageData(this.strokeBefore, 0, 0);
      this.previewBounds = undefined; this.renderedPointCount = 0; this.clearLasso();
    } else if (this.tool() === 'lasso') this.finishLasso();
    else { this.renderStroke(); this.record(); }
    this.stroke = []; this.strokeBefore = undefined; this.previewBounds = undefined; this.renderedPointCount = 0;
  }
  panelPointerDown(e: PointerEvent): void {
    if (this.busy() || !this.panelEditMode() || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    this.panelPointerId = e.pointerId;
    const point = this.toPage(e.clientX, e.clientY);
    this.panelStroke = [point];
    this.panelCutPreview.set(this.panelPreview(point, point));
  }
  panelPointerMove(e: PointerEvent): void {
    if (this.panelPointerId !== e.pointerId) return;
    e.preventDefault(); e.stopPropagation();
    const point = this.toPage(e.clientX, e.clientY);
    this.panelStroke.push(point);
    this.panelCutPreview.set(this.panelPreview(this.panelStroke[0], point));
  }
  panelPointerUp(e: PointerEvent): void {
    if (this.panelPointerId !== e.pointerId) return;
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'pointercancel') {
      this.panelStroke = []; this.panelPointerId = undefined; this.panelCutPreview.set(null);
      return;
    }
    const start = this.panelStroke[0], end = this.toPage(e.clientX, e.clientY);
    const distance = start ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
    if (start && distance >= 24) {
      const preview = this.panelPreview(start, end);
      if (preview) this.applyPanelSplit(preview);
      this.lastPanelTap = undefined;
    } else {
      const gutter = this.findPanelGutter(end);
      if (gutter) {
        const now = performance.now(), pair = `${gutter[0]}:${gutter[1]}`;
        if (this.lastPanelTap && this.lastPanelTap.pair === pair && now - this.lastPanelTap.time < 420 && Math.hypot(end.x - this.lastPanelTap.x, end.y - this.lastPanelTap.y) < 28) {
          this.applyPanelMerge(gutter[0], gutter[1]);
          this.lastPanelTap = undefined;
        } else this.lastPanelTap = { x: end.x, y: end.y, time: now, pair };
      } else this.lastPanelTap = undefined;
    }
    this.panelStroke = []; this.panelPointerId = undefined; this.panelCutPreview.set(null);
  }
  private panelPreview(start: Point, end: Point): PanelCutPreview | null {
    const layout = this.panelLayout(); if (!layout) return null;
    const panelIndex = layout.panels.findIndex(panel => start.x >= panel.x && start.x <= panel.x + panel.width && start.y >= panel.y && start.y <= panel.y + panel.height);
    if (panelIndex < 0) return null;
    const panel = layout.panels[panelIndex];
    const orientation: PanelCutPreview['orientation'] = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'vertical' : 'horizontal';
    const position = orientation === 'vertical' ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
    const minimum = 90;
    const gutter = orientation === 'vertical' ? (layout.verticalGutter || 10) : (layout.horizontalGutter || 18);
    const lower = orientation === 'vertical' ? panel.x + minimum + gutter / 2 : panel.y + minimum + gutter / 2;
    const upper = orientation === 'vertical' ? panel.x + panel.width - minimum - gutter / 2 : panel.y + panel.height - minimum - gutter / 2;
    if (lower >= upper) return null;
    return { panelIndex, orientation, position: Math.max(lower, Math.min(upper, position)) };
  }
  private applyPanelSplit(preview: PanelCutPreview): void {
    const layout = this.panelLayout(); if (!layout) return;
    const next = splitPanel(layout, preview.panelIndex, preview.orientation, preview.position);
    if (!next) return;
    this.panelLayout.set(next); this.record(); this.message.emit('Case découpée. Double-tape la gouttière pour fusionner.');
  }
  private findPanelGutter(point: Point): [number, number] | null {
    const layout = this.panelLayout(); if (!layout) return null;
    let best: { pair: [number, number]; distance: number } | null = null;
    for (let i = 0; i < layout.panels.length; i++) for (let j = i + 1; j < layout.panels.length; j++) {
      const a = layout.panels[i], b = layout.panels[j];
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const verticalGap = a.x + a.width <= b.x ? b.x - (a.x + a.width) : b.x + b.width <= a.x ? a.x - (b.x + b.width) : Infinity;
      const horizontalGap = a.y + a.height <= b.y ? b.y - (a.y + a.height) : b.y + b.height <= a.y ? a.y - (b.y + b.height) : Infinity;
      const verticalEdge = a.x + a.width <= b.x ? a.x + a.width + verticalGap / 2 : b.x + b.width <= a.x ? b.x + b.width + verticalGap / 2 : 0;
      const horizontalEdge = a.y + a.height <= b.y ? a.y + a.height + horizontalGap / 2 : b.y + b.height <= a.y ? b.y + b.height + horizontalGap / 2 : 0;
      const verticalDistance = overlapY > 30 && verticalGap <= Math.max(30, (layout.verticalGutter || 10) * 2.5) ? Math.abs(point.x - verticalEdge) : Infinity;
      const horizontalDistance = overlapX > 30 && horizontalGap <= Math.max(30, (layout.horizontalGutter || 18) * 2.5) ? Math.abs(point.y - horizontalEdge) : Infinity;
      const distance = Math.min(verticalDistance, horizontalDistance);
      if (distance <= 26 && (!best || distance < best.distance)) best = { pair: [i, j], distance };
    }
    return best?.pair || null;
  }
  private applyPanelMerge(first: number, second: number): void {
    const layout = this.panelLayout(); if (!layout) return;
    const next = mergePanels(layout, first, second);
    if (!next) { this.message.emit('Ces cases ne forment pas un rectangle fusionnable.'); return; }
    this.panelLayout.set(next); this.record(); this.message.emit('Cases fusionnées.');
  }
  readonly lassoPath = signal('');
  private clearLasso(): void { this.lassoPath.set(''); }
  private pointBounds(point: Point): PaintBounds {
    const pad = Math.max(4, this.property().size + 2);
    const minX = Math.max(0, Math.floor(point.x - pad));
    const minY = Math.max(0, Math.floor(point.y - pad));
    const maxX = Math.min(PAGE_WIDTH, Math.ceil(point.x + pad));
    const maxY = Math.min(PAGE_HEIGHT, Math.ceil(point.y + pad));
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }
  private extendPreviewBounds(): void {
    for (let index = this.renderedPointCount; index < this.stroke.length; index++) {
      const next = this.pointBounds(this.stroke[index]);
      if (!this.previewBounds) this.previewBounds = next;
      else {
        const left = Math.min(this.previewBounds.x, next.x), top = Math.min(this.previewBounds.y, next.y);
        const right = Math.max(this.previewBounds.x + this.previewBounds.width, next.x + next.width);
        const bottom = Math.max(this.previewBounds.y + this.previewBounds.height, next.y + next.height);
        this.previewBounds = { x: left, y: top, width: right - left, height: bottom - top };
      }
    }
    this.renderedPointCount = this.stroke.length;
  }
  private renderStroke(): void {
    if (!this.strokeBefore) return;
    if (this.previewBounds) {
      const previous = this.previewBounds;
      this.ctx.putImageData(this.strokeBefore, 0, 0, previous.x, previous.y, previous.width, previous.height);
    }
    const points = this.stroke, a = points[0], b = points.at(-1)!;
    if (this.tool() === 'lasso') {
      this.lassoPath.set(points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z'); return;
    }
    const c = this.ctx, props = this.property();
    c.save(); c.lineWidth = props.size; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = props.color; c.fillStyle = props.color;
    c.globalCompositeOperation = this.tool() === 'eraser' ? 'destination-out' : 'source-over';
    c.beginPath();
    if (this.tool() === 'line') {
      const end = { ...b }, angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (Math.abs(angle) < 3 || Math.abs(angle) > 177) end.y = a.y;
      if (Math.abs(Math.abs(angle) - 90) < 3) end.x = a.x;
      c.moveTo(a.x, a.y); c.lineTo(end.x, end.y); c.stroke();
    } else if (this.tool() === 'rect') { c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    else if (points.length === 1) { c.arc(a.x, a.y, props.size / 2, 0, Math.PI * 2); c.fill(); }
    else {
      c.moveTo(a.x, a.y);
      for (let i = 1; i < points.length; i++) { const prev = points[i - 1], next = points[i]; c.quadraticCurveTo(prev.x, prev.y, (prev.x + next.x) / 2, (prev.y + next.y) / 2); }
      c.lineTo(b.x, b.y); c.stroke();
    }
    c.restore();
    this.extendPreviewBounds();
  }
  private pointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j], crosses = (a.y > point.y) !== (b.y > point.y);
      if (crosses && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  private segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
    const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const ab = cross(a, b, c), ab2 = cross(a, b, d), cd = cross(c, d, a), cd2 = cross(c, d, b);
    return ((ab >= 0 && ab2 <= 0) || (ab <= 0 && ab2 >= 0)) && ((cd >= 0 && cd2 <= 0) || (cd <= 0 && cd2 >= 0));
  }
  private lassoIncludesText(text: NativeText, polygon: Point[]): boolean {
    const image = this.textRaster(text), left = text.x, top = text.y, right = left + image.width, bottom = top + image.height;
    const corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    if (corners.some(corner => this.pointInPolygon(corner, polygon))) return true;
    if (polygon.some(point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom)) return true;
    const edges: [Point, Point][] = [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
    return polygon.some((point, i) => this.segmentsIntersect(point, polygon[(i + 1) % polygon.length], ...edges[0]) || this.segmentsIntersect(point, polygon[(i + 1) % polygon.length], ...edges[1]) || this.segmentsIntersect(point, polygon[(i + 1) % polygon.length], ...edges[2]) || this.segmentsIntersect(point, polygon[(i + 1) % polygon.length], ...edges[3]));
  }
  private finishLasso(): void {
    const points = this.stroke;
    if (points.length < 3) { this.clearLasso(); return; }
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => p.x)))), y = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
    const width = Math.min(PAGE_WIDTH, Math.ceil(Math.max(...points.map(p => p.x)))) - x;
    const height = Math.min(PAGE_HEIGHT, Math.ceil(Math.max(...points.map(p => p.y)))) - y;
    if (width < 1 || height < 1) { this.clearLasso(); return; }
    const path = new Path2D(); points.forEach((p, i) => i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)); path.closePath();
    const clip = document.createElement('canvas'); clip.width = width; clip.height = height;
    const c = clip.getContext('2d')!; c.translate(-x, -y); c.clip(path); c.drawImage(this.paint.nativeElement, 0, 0);
    this.ctx.save(); this.ctx.globalCompositeOperation = 'destination-out'; this.ctx.fill(path); this.ctx.restore();
    const textItems = this.texts().filter(text => this.lassoIncludesText(text, points)).map(text => ({ text: structuredClone(text), offsetX: text.x - x, offsetY: text.y - y }));
    if (textItems.length) {
      const selectedIds = new Set(textItems.map(item => item.text.id));
      this.texts.update(texts => texts.filter(text => !selectedIds.has(text.id)));
      this.selectedText.set(null);
    }
    const outline = points.map((p, i) => `${i ? 'L' : 'M'}${(p.x - x) / width},${(p.y - y) / height}`).join(' ') + ' Z';
    this.selection.set({ src: clip.toDataURL(), x, y, width, height, rotation: 0, flip: false, lasso: true, outline, textItems: textItems.length ? textItems : undefined });
    this.clearLasso(); this.dirty.set(true);
  }
  async insertStamp(name: string): Promise<void> {
    if (this.busy()) return;
    // In the APK a gallery tap first commits the current stamp; a subsequent tap inserts.
    if (this.selection()) { await this.commitSelection(); return; }
    this.busy.set(true);
    try {
      const img = await loadImage(this.image(name));
      if (this.destroyed) return;
      const width = img.naturalWidth, height = img.naturalHeight;
      this.selection.set({ src: img.src, x: (PAGE_WIDTH - width) / 2, y: (PAGE_HEIGHT - height) / 2, width, height, rotation: 0, flip: false, lasso: false });
      this.dirty.set(true);
    } catch { this.message.emit('Failed'); }
    finally { this.busy.set(false); }
  }
  async commitSelection(): Promise<void> {
    const selection = this.selection(); if (!selection) return;
    this.busy.set(true);
    try {
      const img = await loadImage(selection.src);
      if (this.destroyed) return;
      this.ctx.save(); this.ctx.translate(selection.x + selection.width / 2, selection.y + selection.height / 2); this.ctx.rotate(selection.rotation); this.ctx.scale(selection.flip ? -1 : 1, 1);
      this.ctx.drawImage(img, -selection.width / 2, -selection.height / 2, selection.width, selection.height); this.ctx.restore();
      if (selection.textItems?.length) {
        this.texts.update(texts => [...texts, ...selection.textItems!.map(item => ({ ...item.text, x: selection.x + item.offsetX, y: selection.y + item.offsetY }))]);
      }
      this.selection.set(null); this.record();
    } catch { this.message.emit('Failed'); }
    finally { this.busy.set(false); if (this.dirty() && !this.selection()) this.scheduleAutoSave(); }
  }
  flipSelection(): void { this.selection.update(s => s ? { ...s, flip: !s.flip } : null); }
  objectDown(e: PointerEvent, mode: string, text?: NativeText): void {
    e.stopPropagation(); e.preventDefault();
    if (this.busy()) return;
    const p = this.toPage(e.clientX, e.clientY);
    const editOnTap = !!text && this.selectedText() === text.id;
    if (text) this.selectedText.set(text.id);
    const s = this.selection() || { src: '', x: text!.x, y: text!.y, width: 1, height: 1, rotation: 0, flip: false, lasso: false };
    this.objectDrag = { id: e.pointerId, mode, start: p, original: { ...s }, text: text ? { ...text } : undefined, editOnTap, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  objectMove(e: PointerEvent): void {
    const d = this.objectDrag; if (!d || d.id !== e.pointerId) return;
    e.stopPropagation(); const p = this.toPage(e.clientX, e.clientY), dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (Math.hypot(dx, dy) > 3 / this.view().scale) d.moved = true;
    const s = d.original;
    if (d.text) {
      const image = this.textRaster(d.text);
      const inset = Math.trunc(Math.trunc(parseInt(String(d.text.size), 34) * this.view().scale * this.density) / 3);
      this.texts.update(texts => texts.map(t => t.id === d.text!.id ? { ...t,
        x: Math.max(inset - image.width, Math.min(PAGE_WIDTH - inset, s.x + dx)),
        y: Math.max(inset - image.height, Math.min(PAGE_HEIGHT - inset, s.y + dy)),
      } : t));
    } else if (d.mode === 'move') this.selection.set({ ...s,
      x: Math.max(-s.width / 2, Math.min(PAGE_WIDTH - s.width / 2, s.x + dx)),
      y: Math.max(-s.height / 2, Math.min(PAGE_HEIGHT - s.height / 2, s.y + dy)),
    });
    else if (d.mode === 'width' || d.mode === 'height') {
      const localX = dx * Math.cos(s.rotation) + dy * Math.sin(s.rotation), localY = -dx * Math.sin(s.rotation) + dy * Math.cos(s.rotation);
      const width = d.mode === 'width' ? Math.max(100, s.width + localX * 2) : s.width;
      const height = d.mode === 'height' ? Math.max(100, s.height + localY * 2) : s.height;
      this.selection.set({ ...s, x: s.x + (s.width - width) / 2, y: s.y + (s.height - height) / 2, width, height });
    } else {
      const center = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
      const distance = Math.hypot(p.x - center.x, p.y - center.y), initialDistance = Math.hypot(d.start.x - center.x, d.start.y - center.y);
      const factor = s.lasso
        ? Math.max(100 / s.width, 100 / s.height, 1 + 2 * (distance - initialDistance) / Math.hypot(s.width, s.height))
        : Math.max(0.05, distance / Math.max(1, initialDistance));
      let rotation = s.rotation + Math.atan2(p.y - center.y, p.x - center.x) - Math.atan2(d.start.y - center.y, d.start.x - center.x);
      if (!s.lasso) {
        const quarterTurn = Math.round(rotation / (Math.PI / 2)) * Math.PI / 2;
        if (Math.abs(rotation - quarterTurn) < 8 * Math.PI / 180) rotation = quarterTurn;
      }
      this.selection.set({ ...s, x: center.x - s.width * factor / 2, y: center.y - s.height * factor / 2, width: s.width * factor, height: s.height * factor, rotation });
    }
  }
  objectUp(e: PointerEvent): void {
    const d = this.objectDrag; if (!d || d.id !== e.pointerId) return;
    e.stopPropagation(); this.objectDrag = undefined;
    if (e.type === 'pointercancel') {
      if (d.text) this.texts.update(texts => texts.map(t => t.id === d.text!.id ? d.text! : t));
      else this.selection.set(d.original);
    } else if (d.text) {
      if (d.moved) this.record();
      else if (d.editOnTap) this.editText(d.text, d.text);
    }
  }
  private textRaster(t: NativeText): { src: string; width: number; height: number } {
    const key = JSON.stringify([t.text, t.size, t.vertical]);
    if (!this.textImages.has(key)) {
      const image = textBitmap(t);
      this.textImages.set(key, { src: image.toDataURL(), width: image.width, height: image.height });
    }
    return this.textImages.get(key)!;
  }
  textSource(t: NativeText): string { return this.textRaster(t).src; }
  private editText(position: Point, text?: NativeText): void {
    // The native ImageView has 50 canvas pixels of padding. Keep stored coordinates
    // at the actual ink position so existing web drafts retain their placement.
    this.textPosition = { x: position.x + (text ? 0 : 50), y: position.y + (text ? 0 : 50) }; this.editingText = text?.id || null;
    this.textValue = text?.text || ''; this.textSize = text?.size || Number(localStorage.getItem('manganame-text-size') || 16); this.textVertical = text?.vertical ?? (localStorage.getItem('manganame-text-vertical') !== 'false');
    this.openDialog('text');
  }
  confirmText(): void {
    if (!this.textValue.trim()) { this.message.emit('No text entered.'); return; }
    const text: NativeText = { id: this.editingText || crypto.randomUUID(), text: this.textValue, size: Number(this.textSize), vertical: this.textVertical, ...this.textPosition };
    localStorage.setItem('manganame-text-size', String(this.textSize));
    localStorage.setItem('manganame-text-vertical', String(this.textVertical));
    try { textBitmap(text); } catch (e) { this.message.emit((e as Error).message); return; }
    this.texts.update(list => this.editingText ? list.map(t => t.id === this.editingText ? text : t) : [...list, text]);
    this.selectedText.set(text.id); this.record(); this.closeDialog();
  }
  deleteText(id: string): void { this.texts.update(list => list.filter(t => t.id !== id)); this.selectedText.set(null); this.record(); }
  voiceInput(): void {
    type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((event: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; abort(): void };
    const host = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const RecognitionApi = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (!RecognitionApi) { this.message.emit('Voice recognition not supported'); return; }
    const recognition = new RecognitionApi();
    this.speechAbort?.(); this.speechAbort = () => recognition.abort();
    recognition.lang = navigator.language; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onresult = event => { const value = event.results[0]?.[0]?.transcript; if (value) this.textValue += (this.textValue ? '\n' : '') + value; };
    recognition.onerror = () => this.message.emit('Voice recognition not supported');
    recognition.onend = () => { this.speechAbort = undefined; };
    try { recognition.start(); } catch { this.message.emit('Voice recognition not supported'); }
  }
  private frame(): Frame { return { bitmap: this.paint.nativeElement.toDataURL(), texts: structuredClone(this.texts()), panels: this.panelLayout() ? structuredClone(this.panelLayout()!) : null }; }
  private record(): void {
    const frame = this.frame();
    let frames = [...this.frames.slice(0, this.cursor + 1), frame];
    let cursor = this.cursor + 1;
    if (frames.length > MAX_HISTORY_FRAMES + 1) {
      const removed = frames.length - (MAX_HISTORY_FRAMES + 1);
      frames = frames.slice(removed); cursor -= removed;
    }
    this.frames = frames; this.cursor = cursor;
    if (this.savedFrame && !this.frames.includes(this.savedFrame)) this.savedFrame = undefined;
    this.updateHistory();
  }
  private updateHistory(): void {
    this.undoCount.set(this.cursor); this.redoCount.set(this.frames.length - this.cursor - 1);
    const dirty = this.frames[this.cursor] !== this.savedFrame;
    this.dirty.set(dirty);
    if (!dirty) this.cancelAutoSave();
    else if (!this.busy() && !this.selection()) this.scheduleAutoSave();
  }
  private async restore(): Promise<void> {
    this.busy.set(true); const revision = ++this.requestRevision;
    const frame = this.frames[this.cursor];
    try {
      const img = await loadImage(frame.bitmap);
      if (this.destroyed || revision !== this.requestRevision) return;
      this.ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT); this.ctx.drawImage(img, 0, 0);
      this.texts.set(structuredClone(frame.texts)); this.panelLayout.set(frame.panels ? structuredClone(frame.panels) : null); this.selectedText.set(null); this.updateHistory();
    } finally { this.busy.set(false); if (this.dirty() && !this.selection()) this.scheduleAutoSave(); }
  }
  async undo(): Promise<void> {
    if (this.busy()) return;
    if (this.selection()) { this.selection.set(null); await this.restore(); return; }
    if (this.cursor > 0) { this.cursor--; await this.restore(); }
  }
  async redo(): Promise<void> { if (!this.busy() && this.cursor < this.frames.length - 1) { this.cursor++; await this.restore(); } }
  clearAll(): void { this.ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT); this.selection.set(null); this.record(); this.closeDialog(); }
  private cancelAutoSave(): void {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = undefined; this.autoSavePending.set(false);
  }
  private scheduleAutoSave(): void {
    if (!this.dirty() || this.busy() || this.selection()) return;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSavePending.set(true);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = undefined;
      this.autoSavePending.set(false);
      void this.autoSave();
    }, 3500);
  }
  private async autoSave(): Promise<void> {
    if (this.destroyed || !this.dirty() || this.busy() || this.selection()) return;
    await this.persist();
  }
  private thumbnailDataUrl(): string {
    const width = 212, scale = width / PAGE_WIDTH, canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = Math.round(PAGE_HEIGHT * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.scale(scale, scale);
    ctx.drawImage(this.paint.nativeElement, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    for (const text of this.texts()) {
      const bitmap = textBitmap(text);
      ctx.drawImage(bitmap, text.x, text.y);
    }
    const panels = this.panelLayout();
    if (panels) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
      for (const panel of panels.panels) ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
    }
    ctx.restore();
    return canvas.toDataURL();
  }
  private async persist(): Promise<void> {
    if (this.busy()) return;
    this.cancelAutoSave();
    this.busy.set(true); this.saving.set(true);
    try {
      const output: NativePage = { ...this.page, bitmap: this.paint.nativeElement.toDataURL(), texts: structuredClone(this.texts()), panels: this.panelLayout() ? structuredClone(this.panelLayout()!) : undefined, thumbnail: '' };
      output.thumbnail = this.thumbnailDataUrl();
      this.pageSave.emit(output);
    } catch { this.message.emit('Saving failed'); this.saving.set(false); this.busy.set(false); }
  }
  async save(): Promise<void> {
    if (this.busy()) return;
    this.cancelAutoSave();
    await this.commitSelection(); this.selectedText.set(null);
    await this.persist();
  }
  markSaved(success = true): void {
    this.saving.set(false);
    if (success) { this.savedFrame = this.frames[this.cursor]; this.updateHistory(); }
    this.busy.set(false);
  }
  requestNavigation(index: number): void {
    if (this.busy()) return;
    if (this.dirty()) { this.pendingNavigation = index; this.openDialog('leave'); }
    else this.navigate.emit(index);
  }
  discardAndLeave(): void { this.closeDialog(); this.navigate.emit(this.pendingNavigation); }
  panelAction(): void {
    if (this.busy()) return;
    if (!this.panelLayout()) { this.panelLayout.set(panelLayout()); this.record(); }
    this.panelEditMode.update(value => !value);
    this.panelCutPreview.set(null); this.panelStroke = []; this.lastPanelTap = undefined;
    this.message.emit(this.panelEditMode()
      ? 'Mode cases activé. Trace un trait pour découper. Double-tape une gouttière pour fusionner.'
      : 'Mode cases terminé.');
  }
  clearPanelLayout(): void {
    if (this.busy() || !this.panelLayout()) return;
    this.panelLayout.set(null);
    this.panelEditMode.set(false);
    this.panelCutPreview.set(null); this.panelStroke = []; this.panelPointerId = undefined; this.lastPanelTap = undefined;
    this.record();
    this.message.emit('Layout de cases supprimé.');
  }
  openDialog(type: 'tool' | 'text' | 'clear' | 'leave'): void {
    const wasOpen = this.dialog.nativeElement.open;
    if (!wasOpen) {
      const active = document.activeElement;
      this.dialogReturnFocus = active instanceof HTMLElement ? active : undefined;
      this.dialog.nativeElement.showModal();
    }
    this.dialogType.set(type);
    this.focusDialogControl();
  }
  closeDialog(): void {
    if (this.dialogType() === 'clear') { this.dialogType.set('tool'); this.focusDialogControl(); return; }
    const wasOpen = this.dialog.nativeElement.open;
    this.dialog.nativeElement.close(); this.dialogType.set(null);
    if (wasOpen) this.restoreDialogFocus();
  }
  cancelDialog(event: Event): void { event.preventDefault(); this.closeDialog(); }
  dialogBackdrop(e: MouseEvent): void { if (e.target === this.dialog.nativeElement) this.closeDialog(); }
  dialogKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const controls = [...this.dialog.nativeElement.querySelectorAll<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  private focusDialogControl(): void {
    requestAnimationFrame(() => {
      const first = this.dialog.nativeElement.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
      first?.focus();
    });
  }
  private restoreDialogFocus(): void {
    const target = this.dialogReturnFocus;
    this.dialogReturnFocus = undefined;
    requestAnimationFrame(() => { if (target?.isConnected) target.focus(); });
  }
  wheel(e: WheelEvent): void {
    e.preventDefault(); const v = this.view(), p = this.toPage(e.clientX, e.clientY), r = this.stage.nativeElement.getBoundingClientRect();
    const scale = Math.max(0.08, Math.min(8, v.scale * Math.exp(-e.deltaY * 0.002)));
    const px = p.x - PAGE_WIDTH / 2, py = p.y - PAGE_HEIGHT / 2;
    this.view.set({ ...v, scale, x: e.clientX - r.left - (px * Math.cos(v.rotation) - py * Math.sin(v.rotation)) * scale, y: e.clientY - r.top - (px * Math.sin(v.rotation) + py * Math.cos(v.rotation)) * scale });
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(e: BeforeUnloadEvent): void { if (this.dirty()) { e.preventDefault(); e.returnValue = ''; } }
  @HostListener('window:keydown', ['$event']) keydown(e: KeyboardEvent): void {
    if (this.dialog.nativeElement.open || (e.target as HTMLElement).matches('input,textarea,select')) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const shortcuts: Record<string, NativeTool> = { b: 'pen', e: 'eraser', l: 'line', r: 'rect', t: 'text', s: 'stamp', q: 'lasso' };
      const nextTool = shortcuts[e.key.toLowerCase()];
      if (nextTool) { e.preventDefault(); this.chooseTool(nextTool); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void this.save(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void (e.shiftKey ? this.redo() : this.undo()); }
    if (e.key === 'Escape') { if (this.selection()) void this.undo(); else this.requestNavigation(-1); }
    if (e.key === 'AudioVolumeDown' && this.volumeControl !== 'none') { e.preventDefault(); void this.undo(); }
    if (e.key === 'AudioVolumeUp' && this.volumeControl !== 'none') {
      e.preventDefault();
      if (this.volumeControl === 'redo_undo') void this.redo();
      else this.tool.set(this.tool() === 'eraser' ? 'pen' : 'eraser');
    }
  }
}
