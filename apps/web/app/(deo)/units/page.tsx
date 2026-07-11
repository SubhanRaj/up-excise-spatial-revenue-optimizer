'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import HelpPanel from '@/app/_components/HelpPanel';

interface Unit { id: number; name: string; type: 'circle' | 'sector' }

type Swal = { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean }> };

function toastError(en: string, hi: string) {
  const SwalG = (window as unknown as { Swal?: Swal }).Swal;
  void SwalG?.fire({
    toast: true,
    position: 'top-end',
    icon: 'error',
    title: en,
    html: `<div style="font-size:12px;color:#64748b;margin-top:2px">${hi}</div>`,
    showConfirmButton: false,
    timer: 4500,
    timerProgressBar: true,
  });
}

function StepHeader({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3 mb-2" aria-label={`Step ${step} of 2`}>
      {[1, 2].map((n) => (
        <div key={n} className="flex items-center gap-3 flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            n < step ? 'bg-success text-success-content' : n === step ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/60'
          }`}>
            {n < step ? '✓' : n}
          </div>
          <span className={`text-sm font-medium ${n === step ? 'text-base-content' : 'text-base-content/50'}`}>
            {n === 1 ? 'Count of Sectors & Circles' : 'Enter Names'}
            <span className="block text-xs font-normal text-base-content/50">{n === 1 ? 'संख्या दर्ज करें' : 'नाम दर्ज करें'}</span>
          </span>
          {n === 1 && <div className={`h-0.5 flex-1 ${step > 1 ? 'bg-success' : 'bg-base-300'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function UnitsPage() {
  const { session } = useSession();
  const district = session?.districtName ?? '';

  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);

  // Step 1 — how many of each (sectors first, then circles)
  const [sectorCount, setSectorCount] = useState('');
  const [circleCount, setCircleCount] = useState('');

  // Step 2 — the actual names, one box per unit; boxes start blank (numbered placeholder only)
  const [sectorNames, setSectorNames] = useState<string[]>([]);
  const [circleNames, setCircleNames] = useState<string[]>([]);
  const [step, setStep] = useState<'count' | 'names'>('count');
  const [submitting, setSubmitting] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const load = useCallback(async () => {
    if (!district) return;
    setUnitsLoading(true);
    const res = await fetch(`/api/districts/${encodeURIComponent(district)}/units`);
    if (res.ok) setUnits(await res.json());
    setUnitsLoading(false);
  }, [district]);

  useEffect(() => { void load(); }, [load]);

  const locked = units.length > 0;

  function goToNames() {
    const ns = Math.max(0, Math.min(50, Number(sectorCount) || 0));
    const nc = Math.max(0, Math.min(50, Number(circleCount) || 0));
    if (nc + ns === 0) {
      toastError('Enter at least 1 circle or sector.', 'कम से कम 1 सर्कल या सेक्टर दर्ज करें।');
      return;
    }
    setSectorNames(Array.from({ length: ns }, (_, i) => sectorNames[i] ?? ''));
    setCircleNames(Array.from({ length: nc }, (_, i) => circleNames[i] ?? ''));
    setTriedSubmit(false);
    setStep('names');
  }

  const allFilled = sectorNames.every((n) => n.trim()) && circleNames.every((n) => n.trim());
  const canSubmit = allFilled && (sectorNames.length + circleNames.length) > 0;

  async function submitUnits() {
    setTriedSubmit(true);
    if (!canSubmit) {
      toastError('Fill in every box before submitting — none can be left blank.', 'सबमिट करने से पहले हर बॉक्स भरें — कोई भी खाली नहीं छोड़ा जा सकता।');
      return;
    }
    const sectors = sectorNames.map((n) => n.trim());
    const circles = circleNames.map((n) => n.trim());

    const SwalG = (window as unknown as { Swal?: Swal }).Swal;
    const confirm = await SwalG?.fire({
      icon: 'warning',
      title: 'Lock circles & sectors?',
      html: `<p>You are about to submit <b>${sectors.length} sector(s)</b> and <b>${circles.length} circle(s)</b> for <b>${district}</b>.</p>
             <p style="margin-top:8px">This <b>cannot be changed later</b> — check spelling carefully before continuing.</p>
             <p style="margin-top:8px;color:#64748b">एक बार सबमिट करने के बाद इसे बदला नहीं जा सकता। आगे बढ़ने से पहले नाम ध्यान से जांच लें।</p>`,
      showCancelButton: true,
      confirmButtonText: 'Yes, Lock & Submit',
      cancelButtonText: 'Go Back',
      confirmButtonColor: '#b91c1c',
    });
    if (!confirm?.isConfirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circles, sectors }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        await SwalG?.fire({
          icon: 'error',
          title: 'Could not submit',
          html: `<p>${body.error ?? 'Please try again.'}</p><p style="font-size:12px;color:#64748b;margin-top:6px">सबमिट नहीं हो सका। कृपया पुनः प्रयास करें।</p>`,
        });
        return;
      }
      void SwalG?.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Circles & sectors locked in.',
        html: `<div style="font-size:12px;color:#64748b;margin-top:2px">सर्कल और सेक्टर लॉक हो गए।</div>`,
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (!district) {
    return (
      <div className="alert alert-warning max-w-xl" role="alert">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Your account has not been assigned a district. Contact your administrator to provision your DEO account.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-xl font-bold">Circles &amp; Sectors — {district}</h2>
        <p className="text-sm text-base-content/70">सर्कल एवं सेक्टर पंजीकरण — यह पहला और अनिवार्य चरण है</p>
      </div>

      <HelpPanel pageKey="units" title="Circles & Sectors — How it works">
        <p><strong>Step 1 — Register all circles and sectors</strong> for your district, in one go, before doing anything else. Tell the system how many sectors and how many circles you have, then type each name in the box provided.</p>
        <p><strong>This is a one-time step.</strong> Once you submit, the list is locked and cannot be edited — check every name carefully first.</p>
        <p><strong>Naming:</strong> Sector names are usually just a number, e.g. &quot;Sector 1&quot;, but can also include an area, e.g. &quot;Sector 1 Hazratganj&quot;. Circle names usually include the area, e.g. &quot;Circle 1 Mall, Malihabad&quot;.</p>
        <p><strong>Step 2 — Download the district template</strong> from the Upload page (unlocked automatically once your circles/sectors are locked).</p>
        <p><strong>Step 3 — Upload &amp; Verify</strong> the consolidated district Excel file, then submit to headquarters.</p>
      </HelpPanel>

      {unitsLoading ? (
        <div className="card bg-base-100 shadow p-6 text-sm text-base-content/70">Loading…</div>
      ) : locked ? (
        <div className="card bg-base-100 shadow p-8 space-y-5 max-w-3xl mx-auto">
          <div className="alert alert-success">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
            <div>
              <p className="font-semibold">Circles &amp; sectors are locked in.</p>
              <p className="text-xs opacity-80">सर्कल एवं सेक्टर लॉक हो चुके हैं — अब इन्हें बदला नहीं जा सकता</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-sm mb-2">Sectors ({units.filter((u) => u.type === 'sector').length})</h3>
              <ul className="space-y-1">
                {units.filter((u) => u.type === 'sector').map((u) => (
                  <li key={u.id} className="text-sm bg-base-200 rounded px-3 py-1.5">{u.name}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Circles ({units.filter((u) => u.type === 'circle').length})</h3>
              <ul className="space-y-1">
                {units.filter((u) => u.type === 'circle').map((u) => (
                  <li key={u.id} className="text-sm bg-base-200 rounded px-3 py-1.5">{u.name}</li>
                ))}
              </ul>
            </div>
          </div>
          <Link href="/upload" className="btn btn-primary self-start">Continue to Upload →</Link>
        </div>
      ) : step === 'count' ? (
        <div className="card bg-base-100 shadow p-8 space-y-6 max-w-2xl mx-auto">
          <StepHeader step={1} />
          <div className="text-center">
            <p className="text-sm text-base-content">Enter the number of sectors and circles for <strong>{district}</strong>.</p>
            <p className="text-xs text-base-content/60">{district} के सेक्टर और सर्कल की संख्या दर्ज करें</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="label justify-center"><span className="label-text font-medium">Number of Sectors<br/>सेक्टर की संख्या</span></label>
              <input
                type="number" min={0} max={50} inputMode="numeric"
                className="input input-bordered input-lg w-full text-center"
                value={sectorCount}
                onChange={(e) => setSectorCount(e.target.value)}
                placeholder="e.g. 6"
                aria-label="Number of sectors"
              />
            </div>
            <div>
              <label className="label justify-center"><span className="label-text font-medium">Number of Circles<br/>सर्कल की संख्या</span></label>
              <input
                type="number" min={0} max={50} inputMode="numeric"
                className="input input-bordered input-lg w-full text-center"
                value={circleCount}
                onChange={(e) => setCircleCount(e.target.value)}
                placeholder="e.g. 4"
                aria-label="Number of circles"
              />
            </div>
          </div>
          <button className="btn btn-primary w-full" onClick={goToNames}>
            Continue →
          </button>
        </div>
      ) : (
        <div className="card bg-base-100 shadow p-8 space-y-6 max-w-2xl mx-auto">
          <StepHeader step={2} />
          <div className="text-center">
            <p className="text-sm text-base-content">Type the name of each sector and circle below. Include the area name if you have one. Every box is required.</p>
            <p className="text-xs text-base-content/60">नीचे प्रत्येक सेक्टर और सर्कल का नाम दर्ज करें। हर बॉक्स भरना अनिवार्य है।</p>
          </div>

          {sectorNames.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3 text-center">Sectors / सेक्टर</h3>
              <div className="flex flex-col gap-3 max-w-md mx-auto">
                {sectorNames.map((name, i) => {
                  const blank = triedSubmit && !name.trim();
                  return (
                    <input
                      key={`sector-${i}`}
                      className={`input input-bordered w-full ${blank ? 'input-error' : ''}`}
                      value={name}
                      placeholder={`Sector ${i + 1}`}
                      aria-label={`Sector ${i + 1} name`}
                      onChange={(e) => setSectorNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {circleNames.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3 text-center">Circles / सर्कल</h3>
              <div className="flex flex-col gap-3 max-w-md mx-auto">
                {circleNames.map((name, i) => {
                  const blank = triedSubmit && !name.trim();
                  return (
                    <input
                      key={`circle-${i}`}
                      className={`input input-bordered w-full ${blank ? 'input-error' : ''}`}
                      value={name}
                      placeholder={`Circle ${i + 1}`}
                      aria-label={`Circle ${i + 1} name`}
                      onChange={(e) => setCircleNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap justify-center pt-2">
            <button className="btn btn-ghost" onClick={() => setStep('count')} disabled={submitting}>← Change Count</button>
            <button className="btn btn-primary" onClick={submitUnits} disabled={submitting}>
              {submitting ? <span className="loading loading-spinner" /> : 'Submit & Lock'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
