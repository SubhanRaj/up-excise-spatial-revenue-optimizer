# HBR (Hotel / Bar / Restaurants) — Scope Addition Notes

> **Status: specced, not yet implemented.** Department confirmed the required decisions on
> 2026-07-28 (below). This file is prep/reference for the implementation pass — the actual code,
> schema, and doc changes have not been made yet. Waiting for explicit go-ahead.

## This is a scope reversal, not a new addition

CLAUDE.md's "What Is Out of Scope" and roadmap.md's §1.4 "Explicit Scope Exclusions" both
currently say, explicitly and deliberately:

> "High-end hotel and restaurant bars... must not be captured, implied, or encoded in the
> schema. Attempting to force out-of-scope data into Phase 1 fields will corrupt the Phase 2
> optimization baseline."

Adding HBR reverses that exclusion everywhere it's written, not just adds a field. Confirmed as
an intentional department-driven decision on 2026-07-28.

## Confirmed decisions (department, 2026-07-28)

| Question | Answer |
|---|---|
| Enum value / template / column naming | `HBR` — used verbatim everywhere an identifier is needed (enum value, Excel dropdown value, DB text value). |
| Full name, for prose/explanations only | "Hotel / Bar / Restaurants" — used in human-readable text (labels, Instructions sheet, docs prose), never as the stored/identifier value. |
| Shop ID format | No distinct prefix/pattern. Free text, same as every other shop type — no new validation. |
| Revenue formula | `License Fee (LF) + Total Consideration Fee involved in the lifting for the previous year` |
| Conditional sub-rules | None. No CL5CC-style flag, no COMPOSITE_SHOP-style sub-component sum. |
| Circle/sector, Thana, adjacency | Same as every other shop type — no special-casing. |
| Legacy data import | None. No existing HBR data anywhere; launches clean via the normal DEO upload flow. |

## Revenue formula maps onto existing columns — no migration needed

`licenseFeeLf` (`license_fee_lf`) and `considerationFee` (`consideration_fee`) already exist on
`phase1_raw_collection` (used today by `COUNTRY_LIQUOR`). HBR's formula is exactly

```
totalRevenue = licenseFeeLf + considerationFee
```

— the same two columns, just a new formula case reusing them. **No new DB column, no new
migration file.** This is the one open question from the original prep notes (item 2) that
resolved to "yes, existing columns map cleanly."

## Where HBR will touch the codebase

| Concern | Current state | HBR change |
|---|---|---|
| Enum | `SHOP_TYPES` in `packages/schema/src/constants.ts` — 5 values. No DB `CHECK` constraint (Worker-enforced only), so a 6th value is schema-safe. | Add `'HBR'`. |
| Shop ID | Free text, uniqueness only via upsert convention (`shop_id + district_name`). | No change — HBR shop IDs are free text like every other type. |
| Revenue formula | `apps/web/src/lib/revenue.ts`'s `computeRevenue()` — one `switch` case per shop type. Dual-verified (browser computes, Worker `api/upload/chunk/route.ts` independently recomputes, zero-tolerance mismatch rejects). | New `case 'HBR': return r.licenseFeeLf + r.considerationFee;` — no new columns. |
| Validation | `apps/web/src/lib/validate.ts` | No new cross-field rule needed (no sub-rules for HBR). |
| Excel template | `apps/web/src/lib/excel.ts` — `SHOP_TYPE_LABELS` (dropdown label), `SHOP_TYPE_REVERSE` (label → enum), `FIELD_GATES` (per-type financial column gating), `COLUMN_GUIDE` (Instructions sheet + tooltips). | New label `Hotel / Bar / Restaurants` (or similar — the *dropdown value/stored data* is `HBR`), reverse-map entry, field gate enabling `license_fee_lf` + `consideration_fee` for `HBR` (same two columns `COUNTRY_LIQUOR` already gates). |
| Admin display | `app/(admin)/admin/districts/[district]/page.tsx` — local `SHOP_TYPES`/`TYPE_LABEL`/`TYPE_BADGE` consts, per-type breakdown bar. | New label + a still-unused DaisyUI badge color (`badge-info`/`accent`/`success`/`warning`/`neutral` are taken by the existing 5 — check what's free, e.g. `badge-secondary`/`badge-ghost`). |
| Verify page | `apps/web/app/(deo)/verify/page.tsx` | Flows through automatically once `SHOP_TYPES` is updated — confirm revenue-preview column renders for the new formula. |
| Search | `apps/web/app/api/admin/search/route.ts` — `shopType` enum filter. | Automatic once the enum is extended. |
| Docs | CLAUDE.md ("Shop Type Enum", "Revenue Formulas" table, "What Is Out of Scope"), roadmap.md (§1.4, §4.3–4.5), README.md ("Data Rules"), `docs/templates/README.md`. | Reverse the exclusion, document formula/fields at the same detail level as the existing five types. All four already updated in this pass — see below. |

## Next step (implementation — awaiting go-ahead)

1. `packages/schema/src/constants.ts` — add `'HBR'` to `SHOP_TYPES`. No `phase1.ts` column changes, no migration file (existing columns cover it).
2. `apps/web/src/lib/revenue.ts`'s `computeRevenue()` — add the `HBR` case.
3. `apps/web/src/lib/excel.ts` — `SHOP_TYPE_LABELS`, `SHOP_TYPE_REVERSE`, `FIELD_GATES` (gate `license_fee_lf` + `consideration_fee` for `HBR`), `COLUMN_GUIDE`.
4. Admin district page (`district/page.tsx`) — `TYPE_LABEL`, `TYPE_BADGE`, breakdown bar.
5. Regenerate the DEO manual PDF (`docs/manual/`) once the Excel template changes, per TEST.md's existing recipe.
6. `pnpm typecheck` before any commit; no commit/push without explicit instruction.
