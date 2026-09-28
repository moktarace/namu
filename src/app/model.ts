export type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'text';
export interface Point {
  x: number;
  y: number;
  pressure: number;
}
export interface Mark {
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
  text?: string;
  fill?: string;
}
export interface MangaPage {
  id: string;
  name: string;
  width: number;
  height: number;
  marks: Mark[];
}
export interface Project {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  direction: 'rtl' | 'ltr';
  favorite: boolean;
  color: string;
  pages: MangaPage[];
}
export const uid = () => crypto.randomUUID();
export function newPage(index: number, width = 1000, height = 1414): MangaPage {
  return { id: uid(), name: `Page ${index}`, width, height, marks: [] };
}
export function newProject(
  title: string,
  direction: 'rtl' | 'ltr' = 'rtl',
  landscape = false,
): Project {
  return {
    id: uid(),
    title: title.trim() || 'Mon nouveau manga',
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    direction,
    favorite: false,
    color: '#e2e7dd',
    pages: [newPage(1, landscape ? 1414 : 1000, landscape ? 1000 : 1414)],
  };
}
export function parseProject(raw: string): Project {
  const data = JSON.parse(raw);
  if (data.format !== 'manganame' || data.version !== 1)
    throw new Error('Ce fichier n’est pas un projet Namu compatible.');
  const p = data.project;
  if (
    !p ||
    typeof p.title !== 'string' ||
    !p.title.trim() ||
    p.title.length > 120 ||
    !['rtl', 'ltr'].includes(p.direction) ||
    !Array.isArray(p.pages) ||
    !p.pages.length ||
    p.pages.length > 200
  )
    throw new Error('Le projet contient des données invalides.');
  let pointCount = 0;
  const pages: MangaPage[] = p.pages.map((page: MangaPage, index: number) => {
    if (
      ![page.width, page.height].every((n) => Number.isInteger(n) && n >= 100 && n <= 4096) ||
      !Array.isArray(page.marks) ||
      page.marks.length > 20000
    )
      throw new Error('Une page est invalide.');
    const marks: Mark[] = page.marks.map((m: Mark) => {
      if (
        !m ||
        !['pen', 'eraser', 'line', 'rect', 'ellipse', 'text'].includes(m.tool) ||
        !/^#[\da-f]{6}$/i.test(m.color) ||
        !Number.isFinite(m.size) ||
        m.size < 0.1 ||
        m.size > 200 ||
        !Array.isArray(m.points) ||
        !m.points.length ||
        m.points.length > 100000 ||
        (m.text !== undefined && (typeof m.text !== 'string' || m.text.length > 1000)) ||
        (m.fill !== undefined && !/^#[\da-f]{6}$/i.test(m.fill))
      )
        throw new Error('Un élément de dessin est invalide.');
      pointCount += m.points.length;
      if (pointCount > 1000000) throw new Error('Le projet est trop volumineux.');
      const points = m.points.map((pt) => {
        if (
          !pt ||
          ![pt.x, pt.y, pt.pressure].every(Number.isFinite) ||
          Math.abs(pt.x) > 20000 ||
          Math.abs(pt.y) > 20000 ||
          pt.pressure < 0 ||
          pt.pressure > 1
        )
          throw new Error('Un point de dessin est invalide.');
        return { x: pt.x, y: pt.y, pressure: pt.pressure };
      });
      return {
        tool: m.tool,
        color: m.color,
        size: m.size,
        points,
        ...(m.text !== undefined ? { text: m.text } : {}),
        ...(m.fill ? { fill: m.fill } : {}),
      };
    });
    return {
      id: uid(),
      name: typeof page.name === 'string' ? page.name.slice(0, 100) : `Page ${index + 1}`,
      width: page.width,
      height: page.height,
      marks,
    };
  });
  return {
    ...newProject(p.title, p.direction),
    description: typeof p.description === 'string' ? p.description.slice(0, 500) : '',
    pages,
  };
}
