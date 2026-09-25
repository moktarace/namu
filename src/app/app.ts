import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { SwUpdate } from '@angular/service-worker';
import { NativeEditor } from './native-editor';
import { NativeStore } from './native-store';
import { Direction, GUIDES, NativeDraft, NativePage, assetUrl, downloadNative, nativeImage, newNativeDraft, newNativePage, pageBitmap, pageGrid } from './native-model';
import { zipImages } from './native-export';

type Dialog = 'new' | 'rename' | 'delete-draft' | 'delete-page' | 'page-settings' | 'order' | 'export' | 'hand' | 'volume' | null;
interface AppRoute { app: 'manganame'; session: string; index: number; screen: 'home' | 'pages' | 'editor' | 'settings'; draftId?: string; pageId?: string }
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
@Component({ selector: 'app-root', imports: [FormsModule, DatePipe, NativeEditor], templateUrl: './app.html', styleUrl: './app.scss', host: { '[style.--physical-pixel.px]': 'physicalPixel' } })
export class App {
  readonly physicalPixel = 1 / (window.devicePixelRatio || 1);
  readonly store = inject(NativeStore);
  readonly swUpdate = inject(SwUpdate);
  readonly image = nativeImage;
  readonly asset = assetUrl;
  readonly guides = GUIDES;
  readonly screen = signal<'home' | 'pages' | 'editor' | 'settings'>('home');
  readonly walkthrough = signal(localStorage.getItem('manganame-walkthrough') !== 'seen');
  readonly selectedId = signal<string | null>(null);
  readonly draft = computed(() => this.store.drafts().find(d => d.id === this.selectedId()) || null);
  readonly columns = signal(this.getColumns());
  readonly pageWidth = signal(this.getPageWidth());
  readonly pageHeight = computed(() => Math.floor(this.pageWidth() / this.physicalPixel * 1.414) * this.physicalPixel);
  readonly grid = computed(() => this.draft() ? pageGrid(this.draft()!, this.columns()) : []);
  readonly editorPages = signal<NativePage[]>([]);
  readonly editorIndex = signal(0);
  readonly modal = signal<Dialog>(null);
  readonly menu = signal<{ kind: 'draft' | 'page'; id: string; x: number; y: number } | null>(null);
  readonly order = signal<NativePage[]>([]);
  readonly selectedExports = signal<string[]>([]);
  readonly exporting = signal(false);
  readonly toast = signal('');
  readonly saving = signal(false);
  readonly installAvailable = signal(false);
  readonly updateAvailable = signal(false);
  readonly hand = signal(localStorage.getItem('manganame-hand') || 'right_handed');
  readonly volume = signal(localStorage.getItem('manganame-volume') || 'none');
  titleValue = ''; guideValue = ''; directionValue: Direction = 'rtl'; spreadValue = true;
  private targetId = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private dragId: string | null = null;
  private route: AppRoute = { app: 'manganame', session: crypto.randomUUID(), index: 0, screen: 'home' };
  private restoringHistory = false;
  private allowEditorLeave = false;
  private installPrompt?: BeforeInstallPromptEvent;
  private dialogReturnFocus?: HTMLElement;
  @ViewChild('mainDialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild(NativeEditor) editor?: NativeEditor;
  constructor() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') this.updateAvailable.set(true);
      });
    }
    void this.store.init().then(() => {
      const saved = history.state as AppRoute | null;
      if (saved?.app === 'manganame') this.applyRoute(saved);
      else history.replaceState(this.route, '');
    });
  }
  private applyRoute(route: AppRoute): void {
    const draft = this.store.drafts().find(d => d.id === route.draftId);
    const page = draft?.pages.find(p => p.id === route.pageId);
    if ((route.screen === 'pages' && !draft) || (route.screen === 'editor' && !page)) {
      route = { ...route, screen: 'home', draftId: undefined, pageId: undefined };
      history.replaceState(route, '');
    }
    this.route = route;
    this.selectedId.set(route.draftId || null);
    if (page && draft && route.screen === 'editor') {
      this.editorIndex.set(draft.pages.indexOf(page)); this.editorPages.set([structuredClone(page)]);
    } else this.editorPages.set([]);
    this.screen.set(route.screen); this.menu.set(null);
  }
  private go(screen: AppRoute['screen'], draftId?: string, pageId?: string): void {
    const replace = screen === 'editor' && this.screen() === 'editor';
    const route: AppRoute = { ...this.route, screen, draftId, pageId, index: this.route.index + (replace ? 0 : 1) };
    if (replace) history.replaceState(route, ''); else history.pushState(route, '');
    this.applyRoute(route);
  }
  goBack(): void {
    if (this.route.index > 0) history.back();
    else this.go('home');
  }
  @HostListener('window:popstate', ['$event']) popped(event: PopStateEvent): void {
    if (this.restoringHistory) { this.restoringHistory = false; return; }
    const target = event.state as AppRoute | null;
    if (target?.app !== 'manganame' || target.session !== this.route.session) return;
    const delta = this.route.index - target.index;
    if (this.dialog.nativeElement.open || this.menu()) {
      this.restoringHistory = true; history.go(delta);
      if (this.dialog.nativeElement.open) this.closeDialog();
      this.menu.set(null); return;
    }
    if (this.screen() === 'editor' && !this.allowEditorLeave && this.editor) {
      if (this.editor.dialog.nativeElement.open || this.editor.busy() || this.editor.dirty()) {
        this.restoringHistory = true; history.go(delta);
        if (this.editor.dialog.nativeElement.open) this.editor.closeDialog();
        else if (!this.editor.busy()) this.editor.requestNavigation(-1);
        return;
      }
    }
    this.allowEditorLeave = false; this.applyRoute(target);
  }
  finishWalkthrough(): void { localStorage.setItem('manganame-walkthrough', 'seen'); this.walkthrough.set(false); }
  @HostListener('window:beforeinstallprompt', ['$event']) captureInstallPrompt(event: Event): void {
    event.preventDefault(); this.installPrompt = event as BeforeInstallPromptEvent; this.installAvailable.set(true);
  }
  async installPwa(): Promise<void> {
    const prompt = this.installPrompt; if (!prompt) return;
    this.installPrompt = undefined; this.installAvailable.set(false);
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { this.notify('Installation unavailable'); }
  }
  async applyUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) return;
    try { await this.swUpdate.activateUpdate(); window.location.reload(); }
    catch { this.notify('Update failed'); }
  }
  private getColumns(): number { return window.innerWidth >= 820 || window.innerWidth > window.innerHeight ? 4 : 2; }
  private getPageWidth(): number {
    const columns = this.getColumns(), density = window.devicePixelRatio || 1;
    // The native adapter uses integer physical pixels before applying 1.414.
    return Math.floor((Math.round(window.innerWidth * density) - (columns + 1) * 16) / columns) / density;
  }
  @HostListener('window:resize') resize(): void { this.columns.set(this.getColumns()); this.pageWidth.set(this.getPageWidth()); this.menu.set(null); }
  @HostListener('window:keydown', ['$event']) key(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || this.screen() === 'editor' || this.dialog.nativeElement.open) return;
    if (this.menu()) this.menu.set(null); else if (this.screen() !== 'home') this.goBack();
  }
  notify(message: string): void { clearTimeout(this.toastTimer); this.toast.set(message); this.toastTimer = setTimeout(() => this.toast.set(''), 3200); }
  openDraft(d: NativeDraft): void { this.go('pages', d.id); }
  openEditor(page: NativePage): void {
    this.go('editor', this.draft()!.id, page.id);
  }
  async navigateEditor(index: number): Promise<void> {
    if (index < 0) { this.allowEditorLeave = true; this.goBack(); return; }
    const draft = this.draft(); if (!draft) return;
    if (index >= draft.pages.length) {
      const page = newNativePage();
      try { await this.store.save({ ...draft, pages: [...draft.pages, page], updatedAt: Date.now() }); }
      catch { this.notify('Saving failed'); return; }
    }
    const page = this.draft()!.pages[index]; if (page) this.openEditor(page);
  }
  async savePage(page: NativePage): Promise<void> {
    const draft = this.draft(); if (!draft) return;
    try {
      await this.store.save({ ...draft, updatedAt: Date.now(), pages: draft.pages.map(p => p.id === page.id ? page : p) });
      this.editor?.markSaved(); this.notify('Saved');
    } catch { this.editor?.markSaved(false); this.notify('Saving failed'); }
  }
  openDialog(type: Dialog): void {
    this.menu.set(null);
    const wasOpen = this.dialog.nativeElement.open;
    if (!wasOpen) {
      const active = document.activeElement;
      this.dialogReturnFocus = active instanceof HTMLElement ? active : undefined;
      this.dialog.nativeElement.showModal();
    }
    this.modal.set(type);
    this.focusDialogControl();
  }
  closeDialog(): void {
    if (this.saving() || this.exporting()) return;
    const wasOpen = this.dialog.nativeElement.open;
    this.dialog.nativeElement.close(); this.modal.set(null);
    if (wasOpen) this.restoreDialogFocus();
  }
  onBackdrop(e: MouseEvent): void { if (e.target === this.dialog.nativeElement) this.closeDialog(); }
  cancelDialog(event: Event): void {
    if (this.saving() || this.exporting()) { event.preventDefault(); return; }
    event.preventDefault(); this.closeDialog();
  }
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
  newDraft(): void { this.titleValue = ''; this.openDialog('new'); }
  openMenu(e: MouseEvent, kind: 'draft' | 'page', id: string): void {
    e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menu.set({ kind, id, x: Math.max(8, Math.min(r.right - 184, innerWidth - 192)), y: Math.max(8, Math.min(r.top, innerHeight - 110)) });
  }
  editTitle(id: string): void { this.targetId = id; this.titleValue = this.store.drafts().find(d => d.id === id)!.title; this.openDialog('rename'); }
  confirmDelete(kind: 'draft' | 'page', id: string): void { this.targetId = id; this.openDialog(kind === 'draft' ? 'delete-draft' : 'delete-page'); }
  async submitDialog(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const type = this.modal(), draft = this.draft();
      if (type === 'new') await this.store.save(newNativeDraft(this.titleValue));
      if (type === 'rename') {
        const target = this.store.drafts().find(d => d.id === this.targetId)!;
        await this.store.save({ ...target, title: this.titleValue.trim() || 'No Title', updatedAt: Date.now() });
      }
      if (type === 'delete-draft') await this.store.remove(this.targetId);
      if (type === 'delete-page' && draft) await this.store.save({ ...draft, pages: draft.pages.filter(p => p.id !== this.targetId), updatedAt: Date.now() });
      if (type === 'page-settings' && draft) await this.store.save({ ...draft, guide: this.guideValue, direction: this.directionValue, firstSpread: this.directionValue === 'ttb' ? false : this.spreadValue, updatedAt: Date.now() });
      if (type === 'order' && draft) await this.store.save({ ...draft, pages: [...this.order()], updatedAt: Date.now() });
      this.saving.set(false); this.closeDialog();
    } catch { this.saving.set(false); this.notify('Saving failed'); }
  }
  async addPage(): Promise<void> {
    const draft = this.draft(); if (!draft || this.saving()) return;
    this.saving.set(true);
    try { await this.store.save({ ...draft, pages: [...draft.pages, newNativePage()], updatedAt: Date.now() }); }
    catch { this.notify('Saving failed'); }
    this.saving.set(false);
  }
  async copyPage(id: string): Promise<void> {
    this.menu.set(null); const draft = this.draft(); if (!draft) return;
    const index = draft.pages.findIndex(p => p.id === id), copy = { ...structuredClone(draft.pages[index]), id: crypto.randomUUID() };
    const pages = [...draft.pages]; pages.push(copy);
    try { await this.store.save({ ...draft, pages, updatedAt: Date.now() }); this.notify('Page copied.'); }
    catch { this.notify('Saving failed'); }
  }
  pageSettings(): void {
    const draft = this.draft()!; this.guideValue = draft.guide; this.directionValue = draft.direction; this.spreadValue = draft.firstSpread; this.openDialog('page-settings');
  }
  reorder(): void { this.order.set([...this.draft()!.pages]); this.openDialog('order'); }
  reorderDown(e: PointerEvent, id: string): void { e.preventDefault(); this.dragId = id; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  reorderMove(e: PointerEvent): void {
    if (!this.dragId) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.reorder-row');
    const to = row?.dataset['id'];
    if (to && to !== this.dragId) {
      this.order.update(list => { const next = [...list], from = next.findIndex(p => p.id === this.dragId), target = next.findIndex(p => p.id === to); next.splice(target, 0, next.splice(from, 1)[0]); return next; });
    }
    const list = this.dialog.nativeElement.querySelector<HTMLElement>('.order-list');
    if (list) { const r = list.getBoundingClientRect(); if (e.clientY < r.top + 35) list.scrollTop -= 16; if (e.clientY > r.bottom - 35) list.scrollTop += 16; }
  }
  reorderUp(): void { this.dragId = null; }
  reorderKey(e: KeyboardEvent, id: string): void {
    if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault();
    this.order.update(list => { const next = [...list], index = next.findIndex(p => p.id === id), target = Math.max(0, Math.min(next.length - 1, index + (e.key === 'ArrowUp' ? -1 : 1))); next.splice(target, 0, next.splice(index, 1)[0]); return next; });
  }
  exportDialog(): void { this.selectedExports.set([]); this.openDialog('export'); }
  toggleExport(id: string): void { this.selectedExports.update(list => list.includes(id) ? list.filter(v => v !== id) : [...list, id]); }
  selectAllExports(): void { this.selectedExports.set(this.selectedExports().length === this.draft()!.pages.length ? [] : this.draft()!.pages.map(p => p.id)); }
  async exportPages(share: boolean): Promise<void> {
    if (this.exporting()) return;
    const draft = this.draft()!, pages = draft.pages.filter(p => this.selectedExports().includes(p.id));
    if (!pages.length) { this.notify('Select an image.'); return; }
    const valid = pages.filter(p => p.bitmap || p.texts.length);
    if (!valid.length) { this.notify(share ? 'Blank pages cannot be shared.' : 'Blank pages cannot be saved.'); return; }
    this.exporting.set(true);
    try {
      const files: File[] = [];
      for (const page of valid) {
        const canvas = await pageBitmap(page), blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Failed')), 'image/png'));
        files.push(new File([blob], `Page${draft.pages.findIndex(p => p.id === page.id) + 1}.png`, { type: 'image/png' }));
      }
      if (share && navigator.canShare?.({ files })) await navigator.share({ files });
      else {
        if (files.length === 1) downloadNative(files[0], files[0].name);
        else {
          const images = await Promise.all(files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
          downloadNative(zipImages(images), `${draft.title.replace(/[\\/:*?"<>|]/g, '_') || 'MangaName'}.zip`);
        }
        if (share) this.notify('Sharing is unavailable in this browser. Images downloaded.');
        else this.notify('Exporting finished.');
      }
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) this.notify('Failed'); }
    this.exporting.set(false);
  }
  setHand(value: string): void { this.hand.set(value); localStorage.setItem('manganame-hand', value); this.closeDialog(); }
  setVolume(value: string): void { this.volume.set(value); localStorage.setItem('manganame-volume', value); this.closeDialog(); }
  settings(): void { this.go('settings'); }
  async refresh(): Promise<void> { this.menu.set(null); try { await this.store.reload(); } catch { this.notify('Failed'); } }
}
