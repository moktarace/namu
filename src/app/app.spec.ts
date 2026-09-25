import { describe, it, expect } from 'vitest';
import { newNativeDraft, newNativePage, pageGrid, parseSimpleScript, sampleDraft } from './native-model';
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
