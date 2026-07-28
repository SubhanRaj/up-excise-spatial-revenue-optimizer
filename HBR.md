# HBR (Hotel / Bar / Restaurants) — Scope Addition Notes

> **Status: implemented.** Department confirmed the required decisions on 2026-07-28 (below);
> code implementation completed the same day. `pnpm typecheck` passes. Not yet regenerated:
> the DEO manual PDF (skipped — the manual's screenshot walkthrough doesn't exercise the shop
> type dropdown/enum list, so it doesn't go stale from this change; regenerate only if a future
> screenshot pass needs to show HBR explicitly).

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
| Full name, for prose/explanations only | "Hotel / Bar / Restaurants" — used only in this file's/roadmap's own explanatory prose, never as the stored value, a DEO-facing label, or the Excel dropdown text. `HBR` is the excise-policy term DEOs already know (covers FL6/FL7/FL7A/FL7AR bar licenses); spelling it out in the UI reads as one specific venue type and confuses DEOs about scope — so the Excel dropdown and every DEO-facing label show `HBR` verbatim. |
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

## Implementation complete (2026-07-28)

1. `packages/schema/src/constants.ts` — `'HBR'` added to `SHOP_TYPES`. `packages/schema/src/phase1.ts`'s `shopType` comment updated to list it. No column changes, no migration file — existing `licenseFeeLf`/`considerationFee` columns cover it.
2. `apps/web/src/lib/revenue.ts`'s `computeRevenue()` — added `case 'HBR': return r.licenseFeeLf + r.considerationFee;`. This function is shared by both the browser pre-flight validation (`validate.ts`) and (via the same import) the dual-verification path, so both sides of the zero-tolerance check cover HBR automatically.
3. `apps/web/src/lib/excel.ts` — `SHOP_TYPE_LABELS.HBR = 'HBR'` (dropdown shows `HBR` directly, per department preference — no need to spell out the full name in the Excel UI itself; feeds `SHOP_TYPE_REVERSE` and the dropdown automatically); `FIELD_GATES` extended so `license_fee_lf` and `consideration_fee` allow `HBR`; `COLUMN_GUIDE` rows updated (shop_type notes list, license_fee_lf "required for" list, consideration_fee description/required-for noting the "previous year's lifting" meaning for HBR).
4. Admin district page (`app/(admin)/admin/districts/[district]/page.tsx`) — `SHOP_TYPES` array, `TYPE_LABEL.HBR`, `TYPE_BADGE.HBR = 'badge-secondary'` (only unused DaisyUI semantic badge color left after the existing 5 types). Breakdown bar, type filter dropdown, and grouped view all consume these consts already, so no template-specific JSX changes were needed.
5. Verify page and admin search route need no changes — both consume `shopType` values dynamically (no hardcoded 5-item lists), so `HBR` flows through automatically.
6. `pnpm typecheck` passed (`packages/schema` + `apps/web`, clean).
7. DEO manual PDF regeneration — skipped. Its screenshot walkthrough (`manual-screenshots.spec.ts`) uses one fixed `COUNTRY_LIQUOR` sample row and never enumerates/screenshots the shop type dropdown or COLUMN_GUIDE sheet, so it doesn't go stale from this change.
8. No commit/push made — awaiting explicit instruction per standing project rule.
