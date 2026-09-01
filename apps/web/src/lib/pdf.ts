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
  didParseCell?: (data: AutoTableCellHookData) => void;
}
interface JsPDFInstance {
  setFontSize: (n: number) => JsPDFInstance;
  setTextColor: (r: number, g: number, b: number) => JsPDFInstance;
  setFillColor: (r: number, g: number, b: number) => JsPDFInstance;
  setDrawColor: (r: number, g: number, b: number) => JsPDFInstance;
  rect: (x: number, y: number, w: number, h: number, style?: string) => JsPDFInstance;
  text: (text: string, x: number, y: number) => JsPDFInstance;
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

interface GeoFeature { properties?: { district?: string }; geometry: { type: string; coordinates: unknown } }

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
    const W = 1000, H = Math.round(W * (maxLat - minLat) / (maxLon - minLon));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const px = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * W;
    const py = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
    const drawRing = (ring: number[][]) => {
      ctx.beginPath();
      ring.forEach(([lon, lat], i) => {
        const x = px(lon ?? 0), y = py(lat ?? 0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#334155';
    for (const f of geo.features) {
      const name = f.properties?.district ?? '';
      const status = statusByName[name] ?? 'pending';
      ctx.fillStyle = STATUS_COLOR[status] ?? '#94a3b8';
      const geom = f.geometry;
      if (geom.type === 'Polygon') {
        drawRing((geom.coordinates as number[][][])[0] ?? []);
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates as number[][][][]) drawRing(poly[0] ?? []);
      }
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
    const mapW = 170, mapH = 170 * (31.0 - 23.3) / (85.1 - 76.6);
    doc.addImage(mapImg, 'PNG', 14, 34, mapW, mapH);

    const legendX = 14 + mapW + 14;
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

    doc.autoTable({
      startY: 26,
      head: [['District', 'DEO', 'Circles/Sectors', 'Vends', 'Revenue']],
      body: buildStatusPageBody(districtsForStatus),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
  }

  const filename = `UP-Excise-SRO-Status-Report-${filenamePart}${statusFilter === 'all' ? '' : `-${filterLabel.replace(/\s+/g, '')}`}.pdf`;
  doc.save(filename);
}
