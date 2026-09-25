import { drawMark } from './drawing';
import { Project } from './model';
import { NativeDraft, PAGE_HEIGHT, PAGE_WIDTH, pageBitmap } from './native-model';

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Import failed'));
  });
}

// One-way compatibility with the discarded prototype. Never write to its database.
export async function importPrototype(target: IDBDatabase): Promise<void> {
  if (indexedDB.databases && !(await indexedDB.databases()).some(db => db.name === 'manganame-atelier')) return;
  const legacy = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open('manganame-atelier');
    let absent = false;
    request.onupgradeneeded = () => { absent = true; request.transaction!.abort(); };
    request.onerror = () => absent ? resolve(null) : reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('Close the prototype tab and reload to recover its drawings.'));
  });
  if (!legacy) return;
  try {
    if (!legacy.objectStoreNames.contains('projects')) return;
    const read = legacy.transaction('projects', 'readonly');
    const projects = read.objectStore('projects').getAll();
    await done(read);
    const meta = target.transaction('meta', 'readonly'), keys = meta.objectStore('meta').getAllKeys();
    await done(meta);
    for (const project of projects.result as Project[]) {
      const key = `prototype-import:${project.id}`;
      if (keys.result.includes(key)) continue;
      // The invented demo is retained in the old database, but does not replace the APK sample.
      if (project.title === 'Les jours de traverse' && project.description === 'Un départ, quelques détours, une nouvelle histoire.' && Math.abs(project.updatedAt - project.createdAt) < 2) continue;
      const draft: NativeDraft = {
        id: `prototype-${project.id}`, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt,
        direction: project.direction, firstSpread: true, guide: '', pages: [],
      };
      for (const page of project.pages) {
        const canvas = document.createElement('canvas'); canvas.width = PAGE_WIDTH; canvas.height = PAGE_HEIGHT;
        const ctx = canvas.getContext('2d')!, scale = Math.min(PAGE_WIDTH / page.width, PAGE_HEIGHT / page.height);
        ctx.translate((PAGE_WIDTH - page.width * scale) / 2, (PAGE_HEIGHT - page.height * scale) / 2); ctx.scale(scale, scale);
        page.marks.forEach(mark => drawMark(ctx, mark));
        const imported = { id: `prototype-${page.id}`, bitmap: page.marks.length ? canvas.toDataURL() : '', thumbnail: '', texts: [] };
        imported.thumbnail = page.marks.length ? (await pageBitmap(imported, 212)).toDataURL() : '';
        draft.pages.push(imported);
      }
      const write = target.transaction(['drafts', 'meta'], 'readwrite');
      write.objectStore('drafts').put(draft); write.objectStore('meta').put(true, key);
      await done(write);
    }
  } finally { legacy.close(); }
}
