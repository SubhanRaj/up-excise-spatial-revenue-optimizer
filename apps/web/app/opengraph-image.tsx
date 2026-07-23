import { ImageResponse } from 'next/og';

export const alt = 'UP Excise Spatial & Revenue Optimization Portal — Department of Excise, Government of Uttar Pradesh';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// No dynamic params on this route, so Next prerenders it once at build time into a static
// asset — same as any other file-convention metadata image — not a per-request Worker call.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f2a44 0%, #1e3a5f 100%)',
          fontFamily: 'sans-serif',
          padding: '80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 110,
            height: 110,
            borderRadius: 28,
            background: '#ffffff',
            color: '#0f2a44',
            fontSize: 48,
            fontWeight: 700,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 40,
          }}
        >
          UP
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 54,
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          UP Excise Spatial &amp; Revenue Optimization Portal
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 20,
            fontSize: 26,
            color: '#bfdbfe',
            textAlign: 'center',
          }}
        >
          Department of Excise, Government of Uttar Pradesh
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 22,
            color: '#e0e7ff',
            textAlign: 'center',
          }}
        >
          Phase 1 — Comprehensive Data Collection Across All 75 Districts
        </div>
      </div>
    ),
    { ...size }
  );
}
