import HelpPanel from '@/app/_components/HelpPanel';

interface Finding {
  status: 'Fixed' | 'Now detected' | 'Needs a decision' | 'Formatting only' | 'Legacy data';
  title: string;
  body: string[];
}

const STATUS_BADGE: Record<Finding['status'], string> = {
  Fixed: 'badge-success',
  'Now detected': 'badge-info',
  'Needs a decision': 'badge-warning',
  'Formatting only': 'badge-warning',
  'Legacy data': 'badge-ghost',
};

const FINDINGS: Finding[] = [
  {
    status: 'Fixed',
    title: 'Revenue recorded in the wrong field',
    body: [
      'Each shop type calculates Total Revenue from a fixed set of fields — see the Revenue Formulas table in the DEO Excel template. A fee entered into a field the formula does not use was previously accepted without complaint, and the amount was silently left out of Total Revenue. The row looked internally consistent, so nothing else in the system ever flagged it.',
      '12,361 entries across 39 of 75 districts show this pattern in data already submitted.',
      'The portal now marks every affected shop with a warning next to its revenue figure, and rejects the same mistake on any new upload. Districts with existing flagged shops need a data-correction request to fix them.',
    ],
  },
  {
    status: 'Needs a decision',
    title: 'Adjacent Thanas listing only one neighbouring station',
    body: [
      'A single Adjacent Thana can be genuine for a station at the edge of a district. Across all submitted data, 7,912 records — about one in four — list only one, which suggests the field was often filled with the nearest station rather than every station that actually borders it.',
      'Recommended for the reverification round: ask DEOs to review any shop with a single Adjacent Thana entry, not to add entries by default.',
    ],
  },
  {
    status: 'Now detected',
    title: 'The same station recorded under different spellings',
    body: [
      'One physical police station sometimes appears under two or three spellings within a district — for example, "Gulariha" and "Gularhiya" in Gorakhpur. This inflates the number of distinct stations shown for a circle or sector.',
      'The portal now lists likely spelling variants for each district for manual review, on the district detail page. It never merges them automatically — two similarly spelled names can genuinely be two different stations, so a person confirms first.',
    ],
  },
  {
    status: 'Needs a decision',
    title: 'A locality name added to the station name',
    body: [
      'In one district\'s data, "Kotwali" consistently appears as "Kotwali City." This may be the station\'s correct registered name — some districts do have a separate City and Dehat Kotwali — or it may be an inconsistency worth standardizing. It needs confirmation from that district before being corrected either way.',
    ],
  },
  {
    status: 'Formatting only',
    title: 'Sector-numbered stations recorded inconsistently',
    body: [
      'Noida\'s police stations are genuinely named by sector rather than locality, which is correct and not an error. The same station appears in different formats within the same district\'s records — for example, "Noida Sec-20," "Sector 20, Noida," and "Sector-20" for the same place. One agreed format, applied consistently, resolves this.',
    ],
  },
  {
    status: 'Legacy data',
    title: 'Adjacent Thanas left blank',
    body: [
      'This field became mandatory in August 2026. 642 records across three districts — Ghazipur, Rampur, and Gautam Buddha Nagar — were submitted before that change and were never resubmitted, so the field is still empty on those rows.',
      'These three districts need a corrected re-upload for the affected shops as part of the reverification round.',
    ],
  },
];

const CHECKLIST = [
  'Open the revenue detail for any shop marked with a warning symbol, and move the amount into the correct field for that shop type.',
  'Check the district\'s Possible Duplicate Thana Names list. Where two names are genuinely the same station, agree on one spelling and resubmit. Where they are different stations, no change is needed.',
  'Re-check any Adjacent Thanas entry with only one name. List every station that actually borders it, not only the nearest one.',
  'Use one consistent spelling and format for every station name in the file.',
  'Confirm no Adjacent Thanas entry has been left blank.',
];

export default function DataQualityPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Data Quality Review</h1>
          <p className="text-base-content/70 mt-1">Phase 1 submission review — all 75 districts</p>
        </div>
        <HelpPanel pageKey="admin_data_quality" title="Data Quality Review">
          <p>This page reviews the data submitted across all 75 districts against Lucknow&apos;s submission, used as the reference for a correctly filled record. It is a point-in-time review, not a live dashboard — the figures reflect the full dataset as reviewed, not the current moment.</p>
          <p className="mt-1">It intentionally does not list which shops or rows are affected in each district. The reverification checklist at the bottom describes what to look for, so each DEO reviews their own district&apos;s data rather than working from a supplied answer key.</p>
        </HelpPanel>
      </div>

      <p className="max-w-3xl text-sm text-base-content/80 leading-relaxed">
        All 75 districts have submitted Phase 1 data — 29,731 shop records in total. This review checked that data against Lucknow&apos;s submission, used as the reference for a correctly filled record: capital-letter station names with no punctuation, and an Adjacent Thanas list of three to eight genuine neighbouring stations. Two of the six patterns below are already fixed in the portal. The rest need a department decision before the reverification round.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Records reviewed</div>
          <div className="stat-value text-2xl">29,731</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Revenue entries in the wrong field</div>
          <div className="stat-value text-2xl text-error">12,361</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Districts with likely station name duplicates</div>
          <div className="stat-value text-2xl text-warning">27</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Records with only one Adjacent Thana</div>
          <div className="stat-value text-2xl text-warning">7,912</div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-1">Findings</h2>
        <p className="text-sm text-base-content/60 mb-4">Ordered by confidence that it is genuinely a mistake, not by how many records it touches.</p>
        <div className="space-y-4">
          {FINDINGS.map((f) => (
            <div key={f.title} className="card bg-base-100 shadow border border-base-200">
              <div className="card-body p-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`badge ${STATUS_BADGE[f.status]} badge-sm font-medium`}>{f.status}</span>
                  <h3 className="font-semibold text-base">{f.title}</h3>
                </div>
                <div className="space-y-2 mt-1">
                  {f.body.map((p, i) => (
                    <p key={i} className="text-sm text-base-content/80 leading-relaxed">{p}</p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card bg-base-100 shadow border border-base-200">
        <div className="card-body p-5">
          <h2 className="text-lg font-semibold">For the reverification round</h2>
          <p className="text-sm text-base-content/60 mb-3">Hand this list to DEOs directly. It describes what to look for, not which shops are affected — each district reviews its own data instead of working from a supplied list.</p>
          <ol className="space-y-3">
            {CHECKLIST.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-base-content/85">
                <span className="badge badge-neutral badge-sm shrink-0 mt-0.5">{i + 1}</span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
