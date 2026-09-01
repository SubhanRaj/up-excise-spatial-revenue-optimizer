'use client';

import { STATUS_COLOR, STATUS_LABEL, statusLabel } from './status';

// jsPDF + jspdf-autotable loaded from CDN in root layout.tsx (never bundled), same convention
// as ExcelJS. autoTable draws a real bordered/paginated table with fixed column widths and
// word-wrap, which is what a browser's own print-to-PDF cannot guarantee across OS/browser
// print drivers — see the districts-page PDF export for why this replaced window.print().
type AutoTableCell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
interface AutoTableCellHookData {
  section: 'head' | 'body' | 'foot';
  row: { index: number };
  column: { index: number };
  cell: { text: string[]; styles: { textColor?: [number, number, number] | number; fontStyle?: string } };
}
interface AutoTableOptions {
  startY?: number;
  head: string[][];
  body: AutoTableCell[][];
  styles?: { fontSize?: number; cellPadding?: number };
  headStyles?: { fillColor?: [number, number, number]; textColor?: [number, number, number] };
  columnStyles?: Record<number, { cellWidth?: number; halign?: 'left' | 'right' | 'center' }>;
  margin?: { left?: number; right?: number };
  didParseCell?: (data: AutoTableCellHookData) => void;
}
interface JsPDFInstance {
  setFontSize: (n: number) => JsPDFInstance;
  setTextColor: (r: number, g: number, b: number) => JsPDFInstance;
  setFillColor: (r: number, g: number, b: number) => JsPDFInstance;
  setDrawColor: (r: number, g: number, b: number) => JsPDFInstance;
  rect: (x: number, y: number, w: number, h: number, style?: string) => JsPDFInstance;
  text: (text: string | string[], x: number, y: number) => JsPDFInstance;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => JsPDFInstance;
  addPage: () => JsPDFInstance;
  autoTable: (opts: AutoTableOptions) => void;
  save: (filename: string) => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
}
declare global {
  const jspdf: { jsPDF: new (opts?: { orientation?: 'portrait' | 'landscape' }) => JsPDFInstance };
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export interface DistrictPdfRow {
  name: string;
  division: string | null;
  deoName: string | null;
  status: string;
  unitCount: number;
  vendCount: number;
  totalRevenue: number;
}

const fmtInr = (n: number) => n >= 1e7 ? `Rs ${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `Rs ${(n / 1e5).toFixed(2)} L` : `Rs ${n.toLocaleString('en-IN')}`;

// India doesn't observe DST, so this offset is always correct — but the report is for a
// state-government audience and read on whatever device/timezone the recipient is in, so the
// timestamp must be pinned to IST explicitly rather than trusting Date's own toLocaleString
// (which reports the *viewer's device* timezone, not necessarily IST).
function istTimestamp(d: Date): { filenamePart: string; displayPart: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const { day, month, year, hour, minute, dayPeriod } = parts;
  return {
    filenamePart: `${day}${month}${year}-${hour}${minute}${dayPeriod}`,
    displayPart: `${day}/${month}/${year}, ${hour}:${minute} ${dayPeriod} IST`,
  };
}

const STATUS_FILTER_LABEL: Record<string, string> = { all: 'All', ...STATUS_LABEL };
// Workflow order (matches STATUS_LABEL's own declaration order in lib/status.ts) — each is its
// own page when exporting "All", so a reader flips from earliest to latest stage.
const STATUS_ORDER = Object.keys(STATUS_LABEL);

// Plain-language definitions printed next to the map legend — a reader outside the portal
// (a meeting, a department circular) has no other way to know what these four words mean.
const STATUS_DESCRIPTION: Record<string, string> = {
  pending: 'Circles and sectors not registered yet.',
  in_progress: 'Circles/sectors registered and data being uploaded, or a submitted district was unlocked for correction and is being re-uploaded.',
  submitted: 'Data uploaded and formally submitted. Stays here until the DEO confirms it in the final verification round.',
  verified: 'The DEO has confirmed the submitted data is correct in the final verification round — a second confirmation, not a second submission.',
};

interface GeoFeature { properties?: { district?: string }; geometry: { type: string; coordinates: unknown } }

// Area-weighted polygon centroid (shoelace-formula based) — used to place each district's
// name label. A plain average of the ring's vertices can land outside an irregularly-shaped
// (e.g. river-bordered) district; this is the standard correct way to find a point that's
// actually representative of the shape's interior.
function polygonCentroid(ring: [number, number][]): [number, number] {
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p0 = ring[i], p1 = ring[i + 1];
    if (!p0 || !p1) continue;
    const cross = p0[0] * p1[1] - p1[0] * p0[1];
    area += cross;
    cx += (p0[0] + p1[0]) * cross;
    cy += (p0[1] + p1[1]) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-6 || ring.length === 0) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

// Renders the same choropleth the admin overview map shows, as a flat PNG — not a screenshot
// of the live Leaflet map (CORS-tainted canvas risk from the CartoDB tile images, and it would
// only be available from the /admin page, not this one) but redrawn from the same GeoJSON file
// the live map uses, colored from the same STATUS_COLOR palette. Returns null on any failure
// (offline, fetch error, bad geometry) — the report still generates without it.
async function buildStatusMapImage(rows: DistrictPdfRow[]): Promise<string | null> {
  try {
    const res = await fetch('/geodata/up-districts.geojson');
    if (!res.ok) return null;
    const geo = await res.json() as { features: GeoFeature[] };
    const statusByName = Object.fromEntries(rows.map((r) => [r.name, r.status]));

    // Same UP crop the live Leaflet map fits to (CLAUDE.md's "Map configuration" — fitBounds
    // [[23.8, 77.1], [30.4, 84.6]]), with a little padding so border districts aren't clipped.
    const minLon = 76.6, maxLon = 85.1, minLat = 23.3, maxLat = 31.0;
    // Higher resolution than the plain fill needs, since this canvas now also carries small
    // per-district text labels that need to stay crisp once embedded and printed.
    const W = 1600, H = Math.round(W * (maxLat - minLat) / (maxLon - minLon));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const px = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * W;
    const py = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
    const project = (ring: number[][]): [number, number][] =>
      ring.map(([lon, lat]) => [px(lon ?? 0), py(lat ?? 0)]);
    const drawRing = (ring: [number, number][]) => {
      ctx.beginPath();
      ring.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#334155';
    const labels: { x: number; y: number; text: string }[] = [];
    for (const f of geo.features) {
      const name = f.properties?.district ?? '';
      const status = statusByName[name] ?? 'pending';
      ctx.fillStyle = STATUS_COLOR[status] ?? '#94a3b8';
      const geom = f.geometry;
      // Only the outer ring of the largest part is labeled — a district with a small detached
      // exclave still gets colored (every ring is drawn) but doesn't need a second label.
      let outerRings: number[][][] = [];
      if (geom.type === 'Polygon') {
        outerRings = [(geom.coordinates as number[][][])[0] ?? []];
      } else if (geom.type === 'MultiPolygon') {
        outerRings = (geom.coordinates as number[][][][]).map((poly) => poly[0] ?? []);
      }
      let largest: [number, number][] = [];
      for (const ring of outerRings) {
        const projected = project(ring);
        drawRing(projected);
        if (projected.length > largest.length) largest = projected;
      }
      if (name && largest.length > 0) {
        const [cx, cy] = polygonCentroid(largest);
        labels.push({ x: cx, y: cy, text: `${name} (${STATUS_LABEL[status] ?? status})` });
      }
    }

    // Text halo (stroke behind fill) so a label stays legible against any status color, same
    // idea as the live Leaflet map's own white/slate text-shadow convention on its labels.
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const { x, y, text } of labels) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#1e293b';
      ctx.fillText(text, x, y);
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** One division-header row (spans every column) followed by that division's districts, A→Z. */
function buildStatusPageBody(districts: DistrictPdfRow[]): AutoTableCell[][] {
  const byDivision = new Map<string, DistrictPdfRow[]>();
  for (const d of districts) {
    const key = d.division ?? 'Unassigned';
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key)!.push(d);
  }
  const body: AutoTableCell[][] = [];
  for (const division of [...byDivision.keys()].sort((a, b) => a.localeCompare(b))) {
    body.push([{
      content: `Division: ${division}`,
      colSpan: 5,
      styles: { fillColor: [226, 232, 240], textColor: [30, 41, 59], fontStyle: 'bold', halign: 'left' },
    }]);
    for (const d of [...byDivision.get(division)!].sort((a, b) => a.name.localeCompare(b.name))) {
      body.push([
        d.name,
        d.deoName ?? '—',
        String(d.unitCount ?? 0),
        d.vendCount.toLocaleString('en-IN'),
        fmtInr(d.totalRevenue),
      ]);
    }
  }
  return body;
}

/**
 * District status report for sharing outside the portal. "All" produces one page per status
 * (workflow order: Pending → In Progress → Submitted → Verified), each grouped by division and
 * alphabetical within it; a single status produces just that one page. A4 landscape, with a
 * choropleth map (redrawn from the same GeoJSON + status palette as the live admin map) on the
 * cover page.
 */
export async function exportDistrictsPdf(rows: DistrictPdfRow[], statusFilter: string = 'all'): Promise<void> {
  const filtered = statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter);
  const doc = new jspdf.jsPDF({ orientation: 'landscape' });
  const { filenamePart, displayPart } = istTimestamp(new Date());
  const filterLabel = STATUS_FILTER_LABEL[statusFilter] ?? 'All';

  // ── Cover page ──────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text(`UP Excise — District Status Report${statusFilter === 'all' ? '' : ` (${filterLabel})`}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${displayPart} · ${filtered.length} of 75 districts`, 14, 25);

  // Legend/counts always reflect all 75 districts, not just the exported slice, so the map
  // stays a useful state-wide reference regardless of which status was picked for export.
  const mapImg = await buildStatusMapImage(rows);
  if (mapImg) {
    // Sized to the actual vertical room on an A4-landscape cover page (210mm tall, minus the
    // title block above and a bottom margin) rather than an arbitrary fixed width — this is
    // the real ceiling on how big the map can get without a second page.
    const mapStartY = 30;
    const mapH = doc.internal.pageSize.getHeight() - mapStartY - 10;
    const mapW = mapH * (85.1 - 76.6) / (31.0 - 23.3);
    doc.addImage(mapImg, 'PNG', 14, mapStartY, mapW, mapH);

    const legendX = 14 + mapW + 14;
    const legendW = doc.internal.pageSize.getWidth() - legendX - 14;
    let legendY = 40;
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('Legend', legendX, legendY);
    legendY += 8;
    doc.setFontSize(9);
    for (const status of STATUS_ORDER) {
      const [r, g, b] = hexToRgb(STATUS_COLOR[status] ?? '#94a3b8');
      doc.setFillColor(r, g, b);
      doc.setDrawColor(51, 65, 85);
      doc.rect(legendX, legendY - 3.2, 4, 4, 'FD');
      doc.setTextColor(30, 41, 59);
      const count = rows.filter((d) => d.status === status).length;
      doc.text(`${STATUS_LABEL[status]} (${count})`, legendX + 7, legendY);
      legendY += 7;
    }

    // What each status actually means — a reader outside the portal has no other way to know.
    legendY += 5;
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text('What each status means', legendX, legendY);
    legendY += 6;
    doc.setFontSize(8);
    for (const status of STATUS_ORDER) {
      doc.setTextColor(...hexToRgb(STATUS_COLOR[status] ?? '#94a3b8'));
      doc.text(STATUS_LABEL[status] ?? status, legendX, legendY);
      legendY += 4;
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(STATUS_DESCRIPTION[status] ?? '', legendW);
      doc.text(lines, legendX, legendY);
      legendY += lines.length * 4 + 3;
    }
  }

  // ── One page per status (or just the one, if a single status was picked) ─
  const statuses = statusFilter === 'all' ? STATUS_ORDER : [statusFilter];
  for (const status of statuses) {
    const districtsForStatus = filtered.filter((d) => d.status === status);
    if (districtsForStatus.length === 0) continue;

    doc.addPage();
    const [r, g, b] = hexToRgb(STATUS_COLOR[status] ?? '#94a3b8');
    doc.setFontSize(14);
    doc.setTextColor(r, g, b);
    doc.text(`${STATUS_LABEL[status] ?? statusLabel(status)} — ${districtsForStatus.length} district${districtsForStatus.length === 1 ? '' : 's'}`, 14, 15);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.text(`Generated ${displayPart}`, 14, 21);

    // Explicit widths summing to the full usable landscape width (297mm page − 14mm margins
    // each side = 269mm) — autoTable's default content-driven sizing left the numeric columns
    // bunched together on the left of a narrower-than-expected table instead of spread evenly
    // across the page.
    doc.autoTable({
      startY: 26,
      head: [['District', 'DEO', 'Circles/Sectors', 'Vends', 'Revenue']],
      body: buildStatusPageBody(districtsForStatus),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 65 },
        1: { cellWidth: 65 },
        2: { cellWidth: 45, halign: 'right' },
        3: { cellWidth: 45, halign: 'right' },
        4: { cellWidth: 49, halign: 'right' },
      },
    });
  }

  const filename = `UP-Excise-SRO-Status-Report-${filenamePart}${statusFilter === 'all' ? '' : `-${filterLabel.replace(/\s+/g, '')}`}.pdf`;
  doc.save(filename);
}
