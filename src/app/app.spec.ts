import { describe, it, expect } from 'vitest';
import { PANEL_TEMPLATES, newNativeDraft, newNativePage, pageGrid, panelLayout, parseSimpleScript, sampleDraft, storyboardSpreads, PAGE_HEIGHT, PAGE_WIDTH } from './native-model';
import { zipImages } from './native-export';

describe('Original page progression', () => {
  const draft = newNativeDraft('Draft');
  draft.pages = Array.from({ length: 5 }, () => newNativePage());
  const order = (direction: 'rtl' | 'ltr' | 'ttb', firstSpread: boolean, columns: number) =>
    pageGrid({ ...draft, direction, firstSpread }, columns).map(p => p ? draft.pages.indexOf(p) + 1 : null);
  it('places right-to-left pages in reversed rows with native empty cells', () => {
    expect(order('rtl', true, 2)).toEqual([2, 1, 4, 3, null, 5]);
    expect(order('rtl', false, 2)).toEqual([1, null, 3, 2, 5, 4]);
    expect(order('rtl', true, 4)).toEqual([4, 3, 2, 1, null, null, null, 5]);
    expect(order('rtl', false, 4)).toEqual([3, 2, 1, null, null, null, 5, 4]);
  });
  it('preserves left-to-right order and removes spread placeholders for web comics', () => {
    expect(order('ltr', false, 2)).toEqual([null, 1, 2, 3, 4, 5]);
    expect(order('ltr', true, 2)).toEqual([1, 2, 3, 4, 5, null]);
    expect(order('ttb', false, 4)).toEqual([1, 2, 3, 4, 5]);
    expect(draft.pages).toHaveLength(5);
  });
  it('creates independent blank pages and the five-page original sample', () => {
    const a = newNativeDraft(''), b = newNativeDraft('');
    expect(a.title).toBe('No Title');
    expect(a.direction).toBe('rtl');
    expect(a.firstSpread).toBe(true);
    expect(a.pages[0].id).not.toBe(b.pages[0].id);
    expect(a.pages[0].bitmap).toBe('');
    expect(sampleDraft().pages.map(p => p.bitmap)).toEqual(['/native/sample0.png', '/native/sample1.png', '/native/sample2.png', '', '']);
  });
});

describe('Double-page storyboard spreads', () => {
  const draft = newNativeDraft('Draft');
  draft.pages = Array.from({ length: 6 }, () => newNativePage());
  const order = (direction: 'rtl' | 'ltr') => storyboardSpreads({ ...draft, direction }).map(([left, right]) => [left ? draft.pages.indexOf(left) + 1 : null, right ? draft.pages.indexOf(right) + 1 : null]);

  it('keeps manga covers on the outside and reverses interior pairs', () => {
    expect(order('rtl')).toEqual([[1, null], [3, 2], [5, 4], [null, 6]]);
  });
  it('keeps western covers on the outside and preserves interior pairs', () => {
    expect(order('ltr')).toEqual([[null, 1], [2, 3], [4, 5], [6, null]]);
  });
  it('uses virtual placeholders without changing the page count', () => {
    const spreads = storyboardSpreads({ ...draft, direction: 'rtl', pages: draft.pages.slice(0, 5) });
    expect(spreads.map(([left, right]) => [left ? draft.pages.indexOf(left) + 1 : null, right ? draft.pages.indexOf(right) + 1 : null])).toEqual([[1, null], [3, 2], [5, 4]]);
    expect(spreads.flat().filter(Boolean)).toHaveLength(5);
    expect(draft.pages).toHaveLength(6);
  });
});

describe('Offline image bundle', () => {
  it('writes matching ZIP local and central records, file bytes, and known CRC32', async () => {
    const content = new TextEncoder().encode('123456789');
    const zip = zipImages([{ name: 'Page1.png', bytes: content }, { name: 'Page2.png', bytes: content }]);
    const bytes = new Uint8Array(await zip.arrayBuffer()), view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    expect(new TextDecoder().decode(bytes.slice(30, 39))).toBe('Page1.png');
    expect([...bytes.slice(39, 48)]).toEqual([...content]);
    const end = bytes.length - 22, directory = view.getUint32(end + 16, true);
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    expect(view.getUint32(directory, true)).toBe(0x02014b50);
    expect(view.getUint32(directory + 16, true)).toBe(0xcbf43926);
    expect(view.getUint32(directory + 42, true)).toBe(0);
    expect(view.getUint32(directory + 55 + 42, true)).toBe(48);
  });
});

describe('Simple storyboard scripts', () => {
  it('splits dialogue blocks into pages and discards formatting markers', () => {
    expect(parseSimpleScript('- Salut\n- Ça va ?\n\n---\n\n- Non, j\'ai mangé mon père')).toEqual([
      ['Salut', 'Ça va ?'], ['Non, j\'ai mangé mon père'],
    ]);
  });
  it('accepts compact bullets and ignores trailing separators', () => {
    expect(parseSimpleScript('-Un\n---\n- Deux\n---')).toEqual([['Un'], ['Deux']]);
  });
});

describe('Panel templates', () => {
  it('keeps every template inside the page with the expected panel count', () => {
    for (const [template, , count] of PANEL_TEMPLATES) {
      const layout = panelLayout(template as Parameters<typeof panelLayout>[0]);
      expect(layout.panels).toHaveLength(count);
      for (const panel of layout.panels) {
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.y).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(PAGE_WIDTH);
        expect(panel.y + panel.height).toBeLessThanOrEqual(PAGE_HEIGHT);
      }
      for (let i = 0; i < layout.panels.length; i++) for (let j = i + 1; j < layout.panels.length; j++) {
        const a = layout.panels[i], b = layout.panels[j];
        const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
          * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(overlap, `panels overlap in ${template}`).toBe(0);
      }
      const rows = new Map<number, number[]>();
      for (const panel of layout.panels) if (panel.height < PAGE_HEIGHT * .82) {
        const row = Math.round(panel.y);
        rows.set(row, [...(rows.get(row) || []), panel.height]);
      }
      for (const heights of rows.values()) if (heights.length > 1) expect(new Set(heights).size, `row heights in ${template}`).toBe(1);
      expect(layout.horizontalGutter).toBeGreaterThan(layout.verticalGutter!);
    }
  });

  it('matches the definitive sheet count without adding named variants', () => {
    expect(PANEL_TEMPLATES).toHaveLength(52);
    expect(PANEL_TEMPLATES.map(([, , count]) => count)).toEqual([
      1,
      ...Array(6).fill(2), ...Array(6).fill(3), ...Array(9).fill(4),
      ...Array(8).fill(5), ...Array(8).fill(6), ...Array(7).fill(7), ...Array(7).fill(8),
    ]);
    expect(PANEL_TEMPLATES[0]).toEqual(['one-1', '1 panel · Template 1', 1]);
  });

  it('keeps four-panel templates asymmetric instead of creating a central cross', () => {
    for (const [template, , count] of PANEL_TEMPLATES.filter(item => item[2] === 4)) {
      const areas = panelLayout(template as Parameters<typeof panelLayout>[0]).panels.map(panel => Math.round(panel.width * panel.height));
      expect(count).toBe(4);
      expect(new Set(areas).size).toBeGreaterThan(1);
    }
  });
});
