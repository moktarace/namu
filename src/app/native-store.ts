import { Injectable, signal } from '@angular/core';
import { NativeDraft, newNativePage, sampleDraft } from './native-model';
import { importPrototype } from './legacy-import';

@Injectable({ providedIn: 'root' })
export class NativeStore {
  readonly drafts = signal<NativeDraft[]>([]);
  readonly ready = signal(false);
  readonly error = signal('');
  private db?: IDBDatabase;
  private writes: Promise<void> = Promise.resolve();
  async init(): Promise<void> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        // Preserve the previous prototype's database; never overwrite users' drawings.
        const request = indexedDB.open('manganame-device', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('drafts', { keyPath: 'id' });
          request.result.createObjectStore('meta');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close the other MangaName tabs and reload.'));
      });
      try { await importPrototype(this.db); } catch (e) { this.fail(e); }
      const tx = this.db.transaction(['drafts', 'meta'], 'readonly');
      const all = tx.objectStore('drafts').getAll();
      const initialized = tx.objectStore('meta').get('initialized');
      await this.done(tx);
      if (!initialized.result) {
        const sample = sampleDraft();
        const write = this.db.transaction(['drafts', 'meta'], 'readwrite');
        write.objectStore('drafts').put(sample);
        write.objectStore('meta').put(true, 'initialized');
        await this.done(write);
        this.drafts.set([...all.result, sample].sort((a, b) => b.updatedAt - a.updatedAt));
      } else {
        const drafts: NativeDraft[] = all.result;
        // Repair only the untouched seed from the early port; edited drafts stay intact.
        for (const draft of drafts) {
          if (draft.title === 'Sample Draft' && Math.abs(draft.updatedAt - draft.createdAt) < 2 && draft.pages.length === 3 &&
              draft.pages.every((page, i) => page.bitmap === `/native/sample${i}.png` && page.thumbnail === `/native/sample${i}_list.png` && !page.texts.length)) {
            draft.pages.push(newNativePage(), newNativePage());
            const repair = this.db.transaction('drafts', 'readwrite');
            repair.objectStore('drafts').put(draft);
            await this.done(repair);
          }
        }
        this.drafts.set(drafts.sort((a, b) => b.updatedAt - a.updatedAt));
      }
    } catch (e) { this.fail(e); }
    this.ready.set(true);
  }
  async reload(): Promise<void> {
    await this.writes;
    const tx = this.requireDb().transaction('drafts', 'readonly');
    const all = tx.objectStore('drafts').getAll();
    await this.done(tx);
    this.drafts.set(all.result.sort((a: NativeDraft, b: NativeDraft) => b.updatedAt - a.updatedAt));
  }
  save(draft: NativeDraft): Promise<void> {
    const copy = structuredClone(draft);
    return this.enqueue(async () => {
      const tx = this.requireDb().transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(copy);
      await this.done(tx);
      this.drafts.update(list => [copy, ...list.filter(d => d.id !== copy.id)].sort((a, b) => b.updatedAt - a.updatedAt));
    });
  }
  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const tx = this.requireDb().transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete(id);
      await this.done(tx);
      this.drafts.update(list => list.filter(d => d.id !== id));
    });
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.writes.then(work);
    this.writes = next.catch(e => this.fail(e));
    return next;
  }
  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error('Saving failed. Local storage is unavailable.');
    return this.db;
  }
  private done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Saving failed'));
    });
  }
  private fail(e: unknown): void { this.error.set(e instanceof Error ? e.message : 'Saving failed'); }
}
