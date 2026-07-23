'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import HelpPanel from '@/app/_components/HelpPanel';

interface Unit { id: number; name: string; type: 'circle' | 'sector' }
interface UnlockRequest { id: number; status: 'pending' | 'approved' | 'denied'; reason: string; adminNote: string | null }

type Swal = { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: string }> };

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

// Unit names are stored as "Sector 1 - Hazratganj" / "Circle 2 - Mall" (see submitUnits below).
// Split for display so the number renders as a distinct badge from the area name — falls back
// to showing the raw name if it doesn't match (e.g. a unit registered before this convention).
function splitUnitName(name: string): { label: string; area: string } {
  const idx = name.indexOf(' - ');
  return idx === -1 ? { label: name, area: '' } : { label: name.slice(0, idx), area: name.slice(idx + 3) };
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

  const [unlockRequest, setUnlockRequest] = useState<UnlockRequest | null>(null);
  const [requestingUnlock, setRequestingUnlock] = useState(false);

  const load = useCallback(async () => {
    if (!district) return;
    setUnitsLoading(true);
    const [unitsRes, reqRes] = await Promise.all([
      fetch(`/api/districts/${encodeURIComponent(district)}/units`),
      fetch(`/api/districts/${encodeURIComponent(district)}/request-unlock`),
    ]);
    if (unitsRes.ok) setUnits(await unitsRes.json());
    if (reqRes.ok) setUnlockRequest((await reqRes.json()).request ?? null);
    setUnitsLoading(false);
  }, [district]);

  useEffect(() => { void load(); }, [load]);

  const locked = units.length > 0;

  async function requestUnlock() {
    const SwalG = (window as unknown as { Swal?: Swal }).Swal;
    const result = await SwalG?.fire({
      icon: 'question',
      title: 'Request unlock?',
      html: `<p style="text-align:left">Explain why your circles/sectors list for <b>${district}</b> needs to be unlocked. An Admin will review and either unlock it or deny the request.</p>
             <p style="text-align:left;margin-top:6px;color:#64748b">बताएं कि आपकी सर्कल/सेक्टर सूची को अनलॉक करने की आवश्यकता क्यों है। एक Admin इसे देखकर या तो अनलॉक करेगा या अस्वीकार करेगा।</p>`,
      input: 'textarea',
      inputPlaceholder: 'Reason (required)',
      showCancelButton: true,
      confirmButtonText: 'Submit Request',
      cancelButtonText: 'Cancel',
      inputValidator: (value: string) => (value && value.trim() ? undefined : 'Please enter a reason.'),
    });
    if (!result?.isConfirmed) return;

    setRequestingUnlock(true);
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/request-unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: String(result.value ?? '').trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        await SwalG?.fire({ icon: 'error', title: 'Could not submit request', text: body.error ?? 'Please try again.' });
        return;
      }
      void SwalG?.fire({
        toast: true, position: 'top-end', icon: 'success', title: 'Unlock request submitted.',
        showConfirmButton: false, timer: 3500, timerProgressBar: true,
      });
      await load();
    } finally {
      setRequestingUnlock(false);
    }
  }

  function goToNames() {
    const ns = Math.max(0, Math.min(50, Number(sectorCount) || 0));
    const nc = Math.max(0, Math.min(50, Number(circleCount) || 0));
    if (nc + ns === 0) {
      toastError('Enter at least 1 circle or sector.', 'कम से कम 1 सर्कल या सेक्टर दर्ज करें।');
      return;
    }
    // Boxes hold ONLY the area name the DEO types — "Sector N -" / "Circle N -" is fixed,
    // non-editable UI next to the box, not part of the value, so the unit number can never be
    // dropped or overwritten (previously a free-text box let DEOs erase the number and type
    // only an area name, losing which unit a shop belongs to).
    setSectorNames(Array.from({ length: ns }, (_, i) => sectorNames[i] ?? ''));
    setCircleNames(Array.from({ length: nc }, (_, i) => circleNames[i] ?? ''));
    setTriedSubmit(false);
    setStep('names');
  }

  // Rural circles are numbered from 1 only when a district has no urban sectors.
  // Once sectors exist, Circle 1 is reserved for the sector-covered urban area and
  // is never (re-)issued to a rural circle — rural circles start at 2.
  const circleNumber = (i: number) => (sectorNames.length === 0 ? i + 1 : i + 2);

  const allFilled = sectorNames.every((n) => n.trim()) && circleNames.every((n) => n.trim());
  const canSubmit = allFilled && (sectorNames.length + circleNames.length) > 0;

  async function submitUnits() {
    setTriedSubmit(true);
    if (!canSubmit) {
      toastError('Enter a name for every sector and circle — none can be left blank.', 'हर सेक्टर और सर्कल के लिए एक नाम दर्ज करें — कोई भी खाली नहीं छोड़ा जा सकता।');
      return;
    }
    const sectors = sectorNames.map((n, i) => `Sector ${i + 1} - ${n.trim()}`);
    const circles = circleNames.map((n, i) => `Circle ${circleNumber(i)} - ${n.trim()}`);

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

  if (!session) {
    return (
      <div className="card bg-base-100 shadow p-8 space-y-4 max-w-2xl mx-auto animate-pulse">
        <div className="h-6 w-1/2 bg-base-300 rounded mx-auto" />
        <div className="h-24 bg-base-300 rounded" />
        <div className="h-10 bg-base-300 rounded" />
      </div>
    );
  }

  const savingOverlay = submitting && (
    <div className="fixed inset-0 z-[1300] bg-black/40 backdrop-blur-sm flex items-center justify-center" role="alert" aria-live="assertive">
      <div className="card bg-base-100 shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm text-center">
        <span className="loading loading-spinner loading-lg text-primary" />
        <div>
          <p className="font-semibold">Locking circles &amp; sectors…</p>
          <p className="text-xs text-base-content/60 mt-1">सर्कल और सेक्टर लॉक हो रहे हैं — कृपया प्रतीक्षा करें</p>
          <p className="text-xs text-base-content/50 mt-2">Do not close or refresh this page.</p>
        </div>
      </div>
    </div>
  );

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
      {savingOverlay}
      <div>
        <h2 className="text-xl font-bold">Circles &amp; Sectors — {district}</h2>
        <p className="text-sm text-base-content/70">सर्कल एवं सेक्टर पंजीकरण — यह पहला और अनिवार्य चरण है</p>
      </div>

      <HelpPanel
        pageKey="units"
        title="Circles & Sectors — How it works"
        titleHi="Circles & Sectors — यह कैसे काम करता है"
        childrenHi={<>
          <p><strong>चरण 1 — सभी circles और sectors रजिस्टर करें</strong> अपने district के लिए, एक ही बार में, कुछ और करने से पहले। सिस्टम को बताएं कि आपके पास कितने sectors और कितने circles हैं, फिर हर नाम दिए गए box में टाइप करें।</p>
          <p><strong>यह एक बार होने वाला चरण है।</strong> सबमिट करने के बाद, list लॉक हो जाती है और इसे edit नहीं किया जा सकता — पहले हर नाम ध्यान से जांच लें।</p>
          <p><strong>नामकरण:</strong> &quot;Sector 1 -&quot;, &quot;Circle 1 -&quot; जैसा नंबर हर बॉक्स के आगे पहले से तय है और इसे बदला नहीं जा सकता — आपको बस बगल के बॉक्स में area का नाम टाइप करना है, जैसे &quot;Sector 1 -&quot; के आगे &quot;Hazratganj&quot;। <strong>यदि आपके district में कोई sector नहीं है</strong> (शुद्ध rural district), तो circles की गिनती Circle 1 से शुरू होती है। <strong>यदि sector हैं</strong> (urban area को cover करते हुए), तो Circle 1 issue नहीं होता — rural circles Circle 2 से शुरू होते हैं।</p>
          <p><strong>चरण 2 — Download the district template</strong> Upload page से (आपके circles/sectors लॉक होते ही यह अपने-आप unlock हो जाता है)।</p>
          <p><strong>चरण 3 — Upload &amp; Verify</strong> करें consolidated district Excel फ़ाइल को, फिर headquarters को सबमिट करें।</p>
          <p><strong>गलती हुई?</strong> लॉक होने के बाद, कारण बताते हुए एक &quot;अनलॉक अनुरोध&quot; सबमिट करें — एक Admin इसकी समीक्षा करके सूची को अनलॉक कर सकता है ताकि आप दोबारा रजिस्टर कर सकें।</p>
        </>}
      >
        <p><strong>Step 1 — Register all circles and sectors</strong> for your district, in one go, before doing anything else. Tell the system how many sectors and how many circles you have, then type each name in the box provided.</p>
        <p><strong>This is a one-time step.</strong> Once you submit, the list is locked and cannot be edited — check every name carefully first.</p>
        <p><strong>Naming:</strong> The &quot;Sector 1 -&quot;, &quot;Circle 1 -&quot; number in front of each box is fixed and cannot be changed — just type the area name next to it, e.g. &quot;Hazratganj&quot; next to &quot;Sector 1 -&quot;. <strong>If your district has no sectors</strong> (a purely rural district), circles are numbered starting from Circle 1. <strong>If sectors exist</strong> (covering the urban area), Circle 1 is never issued — rural circles start numbering from Circle 2.</p>
        <p><strong>Step 2 — Download the district template</strong> from the Upload page (unlocked automatically once your circles/sectors are locked).</p>
        <p><strong>Step 3 — Upload &amp; Verify</strong> the consolidated district Excel file, then submit to headquarters.</p>
        <p><strong>Made a mistake?</strong> Once locked, submit an &quot;unlock request&quot; explaining why — an Admin can review and unlock the list so you can re-register.</p>
      </HelpPanel>

      {unitsLoading ? (
        <div className="card bg-base-100 shadow p-8 space-y-4 max-w-2xl mx-auto animate-pulse">
          <div className="h-5 w-2/3 bg-base-300 rounded mx-auto" />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="h-16 bg-base-300 rounded" />
            <div className="h-16 bg-base-300 rounded" />
          </div>
          <div className="h-10 bg-base-300 rounded" />
        </div>
      ) : locked ? (
        <div className="card bg-base-100 shadow p-8 space-y-5 max-w-3xl mx-auto">
          {/* Header: lock confirmation + a standalone Request Unlock button — kept out of any
              colored alert so its own color never blends into a same-colored banner background. */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-base-200">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-success/15 text-success shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
              </span>
              <div>
                <p className="font-semibold">Circles &amp; sectors are locked in.</p>
                <p className="text-xs text-base-content/60">सर्कल एवं सेक्टर लॉक हो चुके हैं — अब इन्हें बदला नहीं जा सकता</p>
              </div>
            </div>
            {unlockRequest?.status !== 'pending' && (
              <button className="btn btn-sm btn-outline btn-primary shrink-0" onClick={requestUnlock} disabled={requestingUnlock}>
                {requestingUnlock ? <span className="loading loading-spinner loading-xs" /> : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.79-1.3"/></svg>
                    Request Unlock
                  </>
                )}
              </button>
            )}
          </div>

          {/* Unlock-request status — shown up top, before the sector/circle list, so a DEO sees
              the state of their request before scrolling past their own data. */}
          {unlockRequest?.status === 'pending' && (
            <div className="alert alert-info text-sm">
              <span className="loading loading-spinner loading-sm shrink-0" />
              <div>
                <p className="font-semibold">Unlock request pending Admin review.</p>
                <p className="text-xs opacity-80 mt-1">&quot;{unlockRequest.reason}&quot;</p>
                <p className="text-xs opacity-70 mt-1">अनलॉक अनुरोध Admin की समीक्षा के लिए लंबित है।</p>
              </div>
            </div>
          )}
          {unlockRequest?.status === 'denied' && (
            <div className="alert alert-error text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <p className="font-semibold">Your last unlock request was denied.</p>
                {unlockRequest.adminNote && <p className="text-xs opacity-80 mt-1">&quot;{unlockRequest.adminNote}&quot;</p>}
                <p className="text-xs opacity-70 mt-1">आपका पिछला अनलॉक अनुरोध अस्वीकार कर दिया गया — फिर से अनुरोध करने के लिए ऊपर बटन दबाएं।</p>
              </div>
            </div>
          )}
          {!unlockRequest && (
            <p className="text-xs text-base-content/60">Made a mistake? Use the &quot;Request Unlock&quot; button above — an Admin will review it. / गलती हुई? ऊपर &quot;Request Unlock&quot; बटन का उपयोग करें।</p>
          )}

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                Sectors <span className="badge badge-primary badge-sm">{units.filter((u) => u.type === 'sector').length}</span>
              </h3>
              <ul className="space-y-1.5">
                {units.filter((u) => u.type === 'sector').map((u) => {
                  const { label, area } = splitUnitName(u.name);
                  return (
                    <li key={u.id} className="flex items-center gap-2 text-sm bg-base-200 rounded px-3 py-2">
                      {area ? (
                        <>
                          <span className="badge badge-primary badge-outline badge-sm shrink-0">{label}</span>
                          <span className="truncate">{area}</span>
                        </>
                      ) : <span className="truncate">{u.name}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                Circles <span className="badge badge-primary badge-sm">{units.filter((u) => u.type === 'circle').length}</span>
              </h3>
              <ul className="space-y-1.5">
                {units.filter((u) => u.type === 'circle').map((u) => {
                  const { label, area } = splitUnitName(u.name);
                  return (
                    <li key={u.id} className="flex items-center gap-2 text-sm bg-base-200 rounded px-3 py-2">
                      {area ? (
                        <>
                          <span className="badge badge-primary badge-outline badge-sm shrink-0">{label}</span>
                          <span className="truncate">{area}</span>
                        </>
                      ) : <span className="truncate">{u.name}</span>}
                    </li>
                  );
                })}
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
            <p className="text-sm text-base-content">The sector/circle number is fixed — just type the area name next to it. Every box is required.</p>
            <p className="text-xs text-base-content/60">सेक्टर/सर्कल नंबर तय है — बगल में केवल area का नाम टाइप करें। हर बॉक्स भरना अनिवार्य है।</p>
          </div>

          {sectorNames.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3 text-center">Sectors / सेक्टर</h3>
              <div className="flex flex-col gap-3 max-w-md mx-auto">
                {sectorNames.map((name, i) => {
                  const blank = triedSubmit && !name.trim();
                  return (
                    <div key={`sector-${i}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm whitespace-nowrap shrink-0">Sector {i + 1} -</span>
                        <input
                          className={`input input-bordered w-full ${blank ? 'input-error' : ''}`}
                          value={name}
                          placeholder="Area name"
                          aria-label={`Sector ${i + 1} area name`}
                          onChange={(e) => setSectorNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                        />
                      </div>
                      {blank && <span className="mt-1 block text-xs font-bold text-error">Required — यह आवश्यक है</span>}
                    </div>
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
                    <div key={`circle-${i}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm whitespace-nowrap shrink-0">Circle {circleNumber(i)} -</span>
                        <input
                          className={`input input-bordered w-full ${blank ? 'input-error' : ''}`}
                          value={name}
                          placeholder="Area name"
                          aria-label={`Circle ${circleNumber(i)} area name`}
                          onChange={(e) => setCircleNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                        />
                      </div>
                      {blank && <span className="mt-1 block text-xs font-bold text-error">Required — यह आवश्यक है</span>}
                    </div>
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
