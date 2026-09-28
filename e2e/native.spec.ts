import { test, expect, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { AddressInfo } from 'node:net';
import { createPreviewServer } from '../scripts/preview-server.mjs';

async function boot(page: Page, url = '/') {
  await page.goto(url);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Sample Draft ---/ })).toBeVisible();
}
async function create(page: Page, title: string) {
  await boot(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${title} ---`) }).click();
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
}
async function point(page: Page, x: number, y: number) {
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
  const box = (await page.getByLabel('Drawing canvas').boundingBox())!;
  return { x: box.x + x * box.width / 1000, y: box.y + y * box.height / 1414 };
}
async function stroke(page: Page, points: number[][]) {
  const first = await point(page, ...points[0] as [number, number]);
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  for (const [x, y] of points.slice(1)) {
    const next = await point(page, x, y);
    await page.mouse.move(next.x, next.y, { steps: 12 });
  }
  await page.mouse.up();
}
async function pixel(page: Page, x: number, y: number) {
  return page.getByLabel('Drawing canvas').evaluate((canvas: HTMLCanvasElement, p) => {
    // WebKit rounds mouse coordinates to CSS pixels: one screen pixel here is
    // about three canvas pixels. Sample that small area, not a single subpixel.
    const data = canvas.getContext('2d')!.getImageData(p.x - 4, p.y - 4, 9, 9).data;
    let sample = [0, 0, 0, 0];
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > sample[3]) sample = [...data.slice(i, i + 4)];
    return sample;
  }, { x, y });
}
async function tool(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  if (['Pen', 'Eraser', 'Line', 'Rectangle'].includes(name)) await page.keyboard.press('Escape');
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('Saved');
}

test('settings stays in the top toolbar after removing the navigation drawer', async ({ page }) => {
  await boot(page);
  await expect(page.getByRole('button', { name: 'Open navigation drawer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.toolbar-title')).toContainText('Settings');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
});

test('creates pages with distributed dialogue text from a simple script', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'From script', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Script layout');
  await page.getByRole('textbox', { name: 'Script', exact: true }).fill('- One\n- Two\n- Three\n- Four');
  await expect(page.locator('.script-stats')).toHaveText('1 page · 4 dialogues');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: /^Script layout ---/ }).click();
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.editable-text')).toHaveCount(4);
  const positions = await page.locator('.editable-text').evaluateAll(elements => elements.map(element => ({ left: parseFloat((element as HTMLElement).style.left), top: parseFloat((element as HTMLElement).style.top) })));
  expect(positions[0].left).toBeLessThan(500);
  expect(positions[1].left).toBeGreaterThan(500);
  expect(positions[2].top).toBeGreaterThan(600);
  expect(positions[3].top).toBeGreaterThan(600);
  await expect(page.getByRole('img', { name: 'One', exact: true })).toBeVisible();
});

test('starts from one case and edits the panel layout directly', async ({ page }) => {
  await create(page, 'Direct panel editing check');
  await expect(page.getByRole('button', { name: 'Panels', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Panel template', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Panels', exact: true }).click();
  await expect(page.locator('.panel-guides rect')).toHaveCount(1);
  await expect(page.locator('[aria-label="Finish panel editing"]')).toBeVisible();
  await expect(page.locator('.active-tool')).toHaveText('Panels · direct editing');
  await stroke(page, [[250, 700], [750, 700]]);
  await expect(page.locator('.panel-guides rect')).toHaveCount(2);
  const gutter = await point(page, 500, 700);
  await page.mouse.dblclick(gutter.x, gutter.y);
  await expect(page.locator('.panel-guides rect')).toHaveCount(1);
  await expect(page.locator('.panel-guides')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.panel-guides text')).toHaveCount(0);
  await save(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Settings of each Draft', exact: true }).click();
  const draftSettings = page.getByRole('dialog');
  const showPanels = draftSettings.getByRole('checkbox', { name: 'Show panel borders in storyboard and export', exact: true });
  await expect(showPanels).toBeVisible();
  await showPanels.check();
  await draftSettings.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.storyboard-panel-overlay')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Hide panel borders', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await expect(page.locator('.panel-guides rect')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Edit panels', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Select image', exact: true }).click();
  const exportDialog = page.getByRole('dialog');
  const includePanels = exportDialog.getByRole('checkbox', { name: 'Include panel borders', exact: true });
  await expect(includePanels).toBeVisible();
  await expect(includePanels).toBeChecked();
  await exportDialog.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await expect(exportDialog.getByRole('checkbox', { name: 'Include panel borders', exact: true })).toBeChecked();
  await includePanels.uncheck();
  await exportDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.storyboard-panel-overlay')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show panel borders', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await page.getByRole('button', { name: 'Edit panels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear panel layout', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear panel layout', exact: true }).click();
  await expect(page.locator('.panel-guides')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Panels', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.panel-guides rect')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.panel-guides')).toHaveCount(0);
  await save(page);
});

test('autosaves after idle and exposes the save state', async ({ page }) => {
  await create(page, 'Autosave check');
  await stroke(page, [[200, 400], [650, 400]]);
  await expect(page.locator('.save-state')).toHaveText('Autosave pending');
  await expect(page.locator('.save-state')).toHaveText('Saved', { timeout: 8000 });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Page1', exact: true })).toBeVisible();
});

test('shows the active tool shortcuts and keeps dialog focus contained', async ({ page }) => {
  await create(page, 'Accessibility check');
  const activeTool = page.locator('.active-tool');
  await expect(activeTool).toHaveText('Pen · B');
  await page.keyboard.press('e');
  await expect(activeTool).toHaveText('Eraser · E');

  const tools = page.getByRole('button', { name: 'Tools', exact: true });
  await tools.click();
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tools).toBeFocused();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await add.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Title', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
});

test('PWA metadata separates the install shell from lazy media', async ({ page }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: '512x512', src: 'native/icon-512.png' })]));
  expect(manifest.categories).toEqual(expect.arrayContaining(['graphics', 'productivity']));
  const ngsw = await (await page.request.get('/ngsw.json')).json();
  expect(ngsw.assetGroups).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'namu', installMode: 'prefetch' }),
    expect.objectContaining({ name: 'media', installMode: 'lazy', updateMode: 'lazy' }),
  ]));
});

test('manual save, undo/redo, erasing, discard and persistence', async ({ page }) => {
  await create(page, 'Drawing check');
  await stroke(page, [[200, 400], [650, 400]]);
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => pixel(page, 400, 400)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await save(page);
  await tool(page, 'Eraser');
  await stroke(page, [[400, 350], [400, 450]]);
  await expect.poll(() => pixel(page, 400, 400)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Do you wish to leave the page without saving?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Drawing canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Page1', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
});

test('text can be edited, moved and deleted independently of the bitmap', async ({ page }) => {
  await create(page, 'Text check');
  await tool(page, 'Text');
  const p = await point(page, 200, 500); await page.mouse.click(p.x, p.y);
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('First text');
  await page.getByRole('checkbox', { name: 'Text Direction Vertical', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Text Size' }).selectOption({ label: 'XL' });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('img', { name: 'First text', exact: true }).click({ force: true });
  await expect(page.getByRole('textbox', { name: 'Text', exact: true })).toHaveValue('First text');
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Edited text');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const text = page.locator('.editable-text'), box = (await text.boundingBox())!;
  const originalLeft = await text.evaluate(el => (el as HTMLElement).style.left);
  await page.mouse.move(box.x + 5, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + box.height / 2 + 20, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => text.evaluate(el => (el as HTMLElement).style.left)).not.toBe(originalLeft);
  await save(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Edited text', exact: true })).toBeVisible();
  await tool(page, 'Text');
  await page.getByRole('img', { name: 'Edited text', exact: true }).click({ force: true });
  await expect(page.getByRole('button', { name: 'Delete text', exact: true })).toBeVisible();
  await page.getByRole('img', { name: 'Edited text', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Delete text', exact: true }).click();
  await expect(page.locator('.editable-text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Edited text', exact: true })).toBeVisible();
});

test('lasso moves intersected text as editable text without rasterizing it', async ({ page }) => {
  await create(page, 'Lasso text check');
  await tool(page, 'Text');
  const textPoint = await point(page, 400, 500); await page.mouse.click(textPoint.x, textPoint.y);
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Lasso text');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const before = await page.locator('.editable-text').evaluate(el => ({ left: parseFloat((el as HTMLElement).style.left), top: parseFloat((el as HTMLElement).style.top) }));
  await tool(page, 'Lasso');
  await stroke(page, [[250, 300], [700, 300], [700, 700], [250, 700], [250, 300]]);
  await expect(page.locator('.selection-text[alt="Lasso text"]')).toBeVisible();
  await expect(page.locator('.editable-text')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resize and rotate', exact: true })).toHaveCount(0);
  const selection = (await page.locator('.selection').boundingBox())!;
  await page.mouse.move(selection.x + selection.width / 2, selection.y + selection.height / 2); await page.mouse.down();
  await page.mouse.move(selection.x + selection.width / 2 + 50, selection.y + selection.height / 2 + 60, { steps: 8 }); await page.mouse.up();
  await page.mouse.click((await point(page, 850, 1100)).x, (await point(page, 850, 1100)).y);
  await expect(page.locator('.editable-text')).toHaveCount(1);
  const after = await page.locator('.editable-text').evaluate(el => ({ left: parseFloat((el as HTMLElement).style.left), top: parseFloat((el as HTMLElement).style.top) }));
  expect(after.left).toBeGreaterThan(before.left);
  expect(after.top).toBeGreaterThan(before.top);
  await expect(page.getByRole('img', { name: 'Lasso text', exact: true })).toBeVisible();
});

test('stamps transform and lasso moves cut pixels with reversible history', async ({ page }) => {
  await create(page, 'Selection check');
  await stroke(page, [[300, 400], [500, 400]]);
  await tool(page, 'Lasso');
  await stroke(page, [[250, 250], [550, 250], [550, 550], [250, 550], [250, 250]]);
  await expect(page.locator('.selection-outline')).toBeVisible();
  await expect.poll(() => pixel(page, 400, 400)).toEqual([0, 0, 0, 0]);
  const a = await point(page, 400, 400), b = await point(page, 400, 600);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
  await save(page);
  await expect.poll(async () => (await pixel(page, 400, 600))[3]).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => pixel(page, 400, 400)).toEqual([0, 0, 0, 0]);
  await tool(page, 'Stamp');
  await expect(page.locator('.stamp-list button')).toHaveCount(22);
  await page.getByRole('button', { name: 'Face', exact: true }).click();
  await expect(page.locator('.stamp-list button')).toHaveCount(60);
  await page.getByRole('button', { name: 'stamp_face_m_001', exact: true }).click();
  const before = await page.locator('.selection').evaluate(el => (el as HTMLElement).style.width);
  await page.getByRole('button', { name: 'Flip', exact: true }).click();
  await expect(page.locator('.selection-image')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  const handle = (await page.getByRole('button', { name: 'Resize and rotate', exact: true }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 25, handle.y + handle.height / 2 + 15, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.locator('.selection').evaluate(el => (el as HTMLElement).style.width)).not.toBe(before);
  await save(page);
  await expect(page.locator('.selection')).toHaveCount(0);
});

test('sample progression, guides, reorder, copy and real PNG/ZIP exports', async ({ page, browserName }) => {
  const capture = (name: string) => page.screenshot({ path: `../reports/pwa-reference/${browserName === 'chromium' ? '' : browserName + '/'}${name}.png` });
  await boot(page);
  await capture('home');
  await page.getByRole('button', { name: /^Sample Draft ---/ }).click();
  await expect(page.locator('.page-open')).toHaveCount(5);
  await capture('pages');
  await expect(page.locator('.page-card footer>span')).toHaveText(['Page 2', 'Page 1', 'Page 4', 'Page 3', 'Page 5']);
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
  await capture('editor');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await capture('tools');
  await page.getByRole('button', { name: 'Stamp', exact: true }).click();
  await capture('stamps');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Settings of each Draft', exact: true }).click();
  await page.getByRole('combobox', { name: 'Page-Progression-Direction' }).selectOption('ttb');
  await page.getByRole('combobox', { name: 'Guide settings' }).selectOption('grid1');
  await expect(page.getByRole('checkbox', { name: 'Set the first page to double-page spread in single-page view', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.page-card footer>span')).toHaveText(['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5']);
  await expect(page.locator('.page-guide')).toHaveCount(5);
  await page.getByRole('button', { name: 'Reorder', exact: true }).click();
  await page.getByRole('button', { name: 'Move Page1', exact: true }).press('ArrowDown');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Page1', exact: true }).locator('img.page-thumbnail')).toHaveAttribute('src', '/native/sample1_list.png');
  await page.getByRole('button', { name: 'Options Page1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click();
  await expect(page.locator('.page-open')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Page6', exact: true }).locator('img.page-thumbnail')).toHaveAttribute('src', '/native/sample1_list.png');
  await page.getByRole('button', { name: 'Select image', exact: true }).click();
  await page.getByRole('button', { name: 'Select Page1', exact: true }).click();
  await capture('export');
  const single = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const png = await readFile((await (await single).path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1000, 1414]);
  await page.getByRole('button', { name: 'Select Page2', exact: true }).click();
  const multiple = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const zip = await readFile((await (await multiple).path())!);
  expect(zip.readUInt32LE()).toBe(0x04034b50);
  expect(zip.readUInt16LE(zip.length - 12)).toBe(2);
});

test('exports a selected storyboard spread as a two-page PNG', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: /^Sample Draft ---/ }).click();
  await page.getByRole('button', { name: 'Select image', exact: true }).click();
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await page.getByRole('button', { name: 'Select spread 1', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2000, 1414]);
});

test('recovers prototype drawings once without modifying their original database', async ({ page }) => {
  // Same test origin, but no running Angular application while the legacy fixture is written.
  await page.goto('/manifest.webmanifest');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('manganame-atelier', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({ id: 'legacy-fixture', title: 'Recovered draft', description: '', createdAt: 100, updatedAt: 200, direction: 'ltr', pages: [
        { id: 'legacy-page', width: 1000, height: 1414, marks: [{ tool: 'line', size: 8, color: '#000000', points: [{ x: 200, y: 400, pressure: 1 }, { x: 600, y: 400, pressure: 1 }] }] },
      ] });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }));
  await boot(page);
  await page.getByRole('button', { name: /^Recovered draft ---/ }).click();
  await page.getByRole('button', { name: 'Page1', exact: true }).click();
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Page1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Recovered draft ---/ })).toHaveCount(1);
  const legacy = await page.evaluate(() => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open('manganame-atelier');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('projects'), row = tx.objectStore('projects').get('legacy-fixture');
      tx.oncomplete = () => { db.close(); resolve(row.result); }; tx.onerror = () => reject(tx.error);
    };
  }));
  expect(legacy.pages[0].marks).toHaveLength(1);
  expect(legacy.updatedAt).toBe(200);
});

test('browser Back preserves unsaved work until discard is confirmed', async ({ page }) => {
  await create(page, 'Navigation check');
  await stroke(page, [[200, 400], [650, 400]]);
  await page.goBack();
  await expect(page.getByRole('dialog')).toContainText('Do you wish to leave the page without saving?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Drawing canvas')).toBeVisible();
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
  await page.goBack();
  await page.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Page1', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => pixel(page, 400, 400)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: 'Next Page', exact: true }).click();
  await expect(page.locator('.toolbar-title small')).toHaveText('2 / 2');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Page2', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: /^Navigation check ---/ })).toBeVisible();
});

test('two-finger pan, zoom and rotation do not leave an accidental stroke', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch injection uses the Chromium DevTools protocol.');
  await create(page, 'Touch check');
  const before = await page.locator('.paper').getAttribute('style');
  const session = await context.newCDPSession(page);
  const a = await point(page, 300, 400), b = await point(page, 600, 400);
  const touch = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, a.x, a.y)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, a.x, a.y), touch(2, b.x, b.y)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, a.x - 20, a.y - 10), touch(2, b.x + 20, b.y + 30)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('.paper').getAttribute('style')).not.toBe(before);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  const hasInk = await page.getByLabel('Drawing canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
    return false;
  });
  expect(hasInk).toBe(false);
});

test('a pinch starting on text transforms the canvas without moving the text', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch injection uses the Chromium DevTools protocol.');
  await create(page, 'Text gesture check');
  await tool(page, 'Text');
  const origin = await point(page, 250, 450); await page.mouse.click(origin.x, origin.y);
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Pinch');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await save(page);
  const paperBefore = await page.locator('.paper').getAttribute('style');
  const text = page.locator('.editable-text'), position = await text.evaluate(el => [(el as HTMLElement).style.left, (el as HTMLElement).style.top]);
  const box = (await text.boundingBox())!, a = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, b = { x: a.x + 80, y: a.y };
  const session = await context.newCDPSession(page);
  const touch = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, a.x, a.y)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, a.x, a.y), touch(2, b.x, b.y)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, a.x - 15, a.y), touch(2, b.x + 15, b.y + 25)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('.paper').getAttribute('style')).not.toBe(paperBefore);
  await expect.poll(() => text.evaluate(el => [(el as HTMLElement).style.left, (el as HTMLElement).style.top])).toEqual(position);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('fullscreen and toolbar rotation retain the canvas view and drawing', async ({ page }) => {
  await create(page, 'Fullscreen check');
  await stroke(page, [[300, 400], [600, 400]]);
  const paper = page.locator('.paper'), initial = await paper.getAttribute('style');
  const center = await point(page, 500, 700);
  await page.mouse.move(center.x, center.y); await page.mouse.wheel(0, -120);
  await expect.poll(() => paper.getAttribute('style')).not.toBe(initial);
  const zoomed = await paper.getAttribute('style');
  await page.getByRole('button', { name: 'Rotate toolbar', exact: true }).click();
  await expect(page.locator('.floating-bar')).toHaveClass(/horizontal/);
  await expect(paper).toHaveAttribute('style', zoomed!);
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).not.toBeVisible();
  await expect(paper).toHaveAttribute('style', zoomed!);
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(paper).toHaveAttribute('style', zoomed!);
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
  await save(page);
});

test('clear all preserves text and returns to the tool dialog on cancel', async ({ page }) => {
  await create(page, 'Clear check');
  await stroke(page, [[300, 400], [600, 400]]);
  await tool(page, 'Text');
  const p = await point(page, 200, 600); await page.mouse.click(p.x, p.y);
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Keep text');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Width 200', exact: true })).toBeVisible();
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Width 200', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => pixel(page, 400, 400)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('img', { name: 'Keep text', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await pixel(page, 400, 400))[3]).toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: 'Keep text', exact: true })).toBeVisible();
});

test('landscape and tablet layouts use the APK resource dimensions', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 744, height: 393 });
  await boot(page);
  await expect(page.locator('.toolbar')).toHaveCSS('height', '48px');
  await expect(page.locator('.draft-thumbnail')).toHaveCSS('width', '70px');
  await page.getByRole('button', { name: /^Sample Draft ---/ }).click();
  await expect(page.locator('.page-card footer>span')).toHaveText(['Page 4', 'Page 3', 'Page 2', 'Page 1', 'Page 5']);
  if (browserName === 'chromium') await page.screenshot({ path: '../reports/pwa-reference/pages-landscape.png' });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator('.toolbar')).toHaveCSS('height', '64px');
  await expect(page.locator('.draft-thumbnail')).toHaveCSS('width', '80px');
  await expect(page.locator('.draft-thumbnail')).toHaveCSS('height', '113px');
  await page.getByRole('button', { name: /^Sample Draft ---/ }).click();
  await expect(page.locator('.page-card footer>span')).toHaveText(['Page 2', 'Page 1', 'Page 4', 'Page 3', 'Page 5']);
  if (browserName === 'chromium') await page.screenshot({ path: '../reports/pwa-reference/pages-tablet.png' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.toolbar')).toHaveCSS('height', '64px');
  await expect(page.locator('.page-card footer>span')).toHaveText(['Page 4', 'Page 3', 'Page 2', 'Page 1', 'Page 5']);
});

test('installed cache reloads and renders local text entirely offline', async ({ page, context, browserName }) => {
  // Cut this test's server, never the user's preview. WebKit's simulated offline
  // mode aborts navigation before reaching its service worker in this runtime.
  const server = createPreviewServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const stop = async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); };
  try {
  const external: string[] = [];
  context.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await boot(page, origin);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Activation precedes completion of Angular's asset prefetch.
  const manifest = await (await page.request.get(origin + '/ngsw.json')).json();
  const assets: string[] = manifest.assetGroups
    .filter((group: { installMode: string }) => group.installMode === 'prefetch')
    .flatMap((group: { urls: string[] }) => group.urls);
  await expect.poll(() => page.evaluate(async urls => (await Promise.all(urls.map(url => caches.match(url)))).every(Boolean), assets), { timeout: 20000 }).toBe(true);
  // A controlled request also waits for Angular to finish initializing its
  // version table, after writing the individual prefetched cache responses.
  await expect(page.evaluate(async () => (await fetch('/index.html')).text())).resolves.toContain('<app-root>');
  await stop();
  if (browserName === 'chromium') await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /^Sample Draft ---/ }).click();
  await page.getByRole('button', { name: 'Page4', exact: true }).click();
  await expect(page.getByLabel('Drawing canvas')).toHaveAttribute('aria-busy', 'false');
  await tool(page, 'Text');
  const p = await point(page, 250, 500); await page.mouse.click(p.x, p.y);
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Offline');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Offline', exact: true })).toBeVisible();
  await save(page);
  expect(external).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await stop(); }
});
