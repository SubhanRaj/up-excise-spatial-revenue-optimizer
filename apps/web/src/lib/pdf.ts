'use client';

import { STATUS_COLOR, statusLabel } from './status';

// jsPDF + jspdf-autotable loaded from CDN in root layout.tsx (never bundled), same convention
// as ExcelJS. autoTable draws a real bordered/paginated table with fixed column widths and
// word-wrap, which is what a browser's own print-to-PDF cannot guarantee across OS/browser
// print drivers — see the districts-page PDF export for why this replaced window.print().
interface AutoTableCellHookData {
  section: 'head' | 'body' | 'foot';
  row: { index: number };
  column: { index: number };
  cell: { text: string[]; styles: { textColor?: [number, number, number] | number; fontStyle?: string } };
}
interface AutoTableOptions {
  startY?: number;
  head: string[][];
  body: string[][];
  styles?: { fontSize?: number; cellPadding?: number };
  headStyles?: { fillColor?: [number, number, number]; textColor?: [number, number, number] };
  columnStyles?: Record<number, { cellWidth?: number; halign?: 'left' | 'right' | 'center' }>;
  didParseCell?: (data: AutoTableCellHookData) => void;
}
interface JsPDFInstance {
  setFontSize: (n: number) => JsPDFInstance;
  setTextColor: (r: number, g: number, b: number) => JsPDFInstance;
  text: (text: string, x: number, y: number) => JsPDFInstance;
  autoTable: (opts: AutoTableOptions) => void;
  save: (filename: string) => void;
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

/** District status report — sorted by division then name, for sharing outside the portal. */
export function exportDistrictsPdf(rows: DistrictPdfRow[]): void {
  const sorted = [...rows].sort((a, b) =>
    (a.division ?? '').localeCompare(b.division ?? '') || a.name.localeCompare(b.name));

  const doc = new jspdf.jsPDF({ orientation: 'portrait' });

  doc.setFontSize(14);
  doc.text('UP Excise — District Status Report', 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')} · ${sorted.length} of 75 districts`, 14, 21);

  doc.autoTable({
    startY: 26,
    head: [['District', 'Division', 'DEO', 'Status', 'Circles/Sectors', 'Vends', 'Revenue']],
    body: sorted.map((d) => [
      d.name,
      d.division ?? '—',
      d.deoName ?? '—',
      statusLabel(d.status),
      String(d.unitCount ?? 0),
      d.vendCount.toLocaleString('en-IN'),
      fmtInr(d.totalRevenue),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const status = sorted[data.row.index]?.status;
        data.cell.styles.textColor = hexToRgb(STATUS_COLOR[status ?? 'pending'] ?? '#94a3b8');
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const filename = `up-excise-district-status-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
