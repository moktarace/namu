import { MangaPage, Mark } from './model';

export function drawMark(ctx: CanvasRenderingContext2D, mark: Mark): void {
  const [a, b = a] = mark.points;
  if (!a) return;
  ctx.save();
  ctx.globalCompositeOperation = mark.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.fill ?? mark.color;
  ctx.lineWidth = mark.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (mark.tool === 'pen' || mark.tool === 'eraser') {
    if (mark.points.length === 1) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, (mark.size * (0.35 + a.pressure * 0.65)) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 1; i < mark.points.length; i++) {
      const prev = mark.points[i - 1],
        current = mark.points[i];
      ctx.lineWidth = mark.size * (0.35 + (prev.pressure + current.pressure) * 0.325);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
  } else if (mark.tool === 'text') {
    ctx.font = `500 ${mark.size}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    (mark.text ?? '')
      .split('\n')
      .forEach((line, i) => ctx.fillText(line, a.x, a.y + i * mark.size * 1.3));
  } else {
    ctx.beginPath();
    if (mark.tool === 'line') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    if (mark.tool === 'rect') ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (mark.tool === 'ellipse')
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
    if (mark.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function renderPage(
  canvas: HTMLCanvasElement,
  page: MangaPage,
  draft?: Mark,
  scale = 1,
): void {
  const width = Math.round(page.width * scale),
    height = Math.round(page.height * scale);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(scale, scale);
  for (const mark of page.marks) drawMark(ctx, mark);
  if (draft) drawMark(ctx, draft);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.restore();
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const safeFilename = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .slice(0, 90) || 'Namu';
