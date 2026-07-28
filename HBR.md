# HBR (Hotel Bar Restaurants) — Scope Addition Notes

> **Status: not started.** This file is a research/prep note, not a spec — it captures what was
> found by scanning the current codebase and docs on 2026-07-28, ahead of receiving the actual
> HBR data (ID format, revenue formula, any conditional fields) from the department. Nothing
> described here has been implemented yet.

## This is a scope reversal, not a new addition

CLAUDE.md's "What Is Out of Scope" and roadmap.md's §1.4 "Explicit Scope Exclusions" both
currently say, explicitly and deliberately:

> "High-end hotel and restaurant bars... must not be captured, implied, or encoded in the
> schema. Attempting to force out-of-scope data into Phase 1 fields will corrupt the Phase 2
> optimization baseline."

Adding HBR means reversing that exclusion everywhere it's written, not just adding a field.
Confirm this is an intentional department-driven decision before implementation starts (it was
raised and acknowledged in conversation on 2026-07-28, but isn't yet reflected in the docs).

## Where HBR will touch the codebase

| Concern | Current state | What HBR needs |
|---|---|---|
| Enum | `SHOP_TYPES` in `packages/schema/src/constants.ts` — 5 values (`MODEL_SHOP`, `COMPOSITE_SHOP`, `BHANG_SHOP`, `PRV`, `COUNTRY_LIQUOR`). No DB `CHECK` constraint exists (`migrations/0001_initial.sql` has none — Worker-enforced only), so adding a 6th value is schema-safe, no migration required for the enum itself. | New constant, e.g. `'HBR'` |
| Shop ID | `shop_id` (`phase1_raw_collection.shop_id`) is free text. Uniqueness is enforced only as an upsert convention (`onConflictDoUpdate` on `shop_id + district_name`) — no format/regex validated anywhere in the codebase today. | Need to know: does HBR's ID need a distinct validated prefix/pattern, or is it just free text like every other shop type? |
| Revenue formula | `apps/web/src/lib/revenue.ts`'s `computeRevenue()` — one `switch` case per shop type. Dual-verified: browser computes, Worker (`api/upload/chunk/route.ts`) independently recomputes from raw fields, zero-tolerance mismatch rejects the row (`apps/web/src/lib/validate.ts`). | A new `case 'HBR':` branch, plus whichever financial component fields the formula is built from — new `phase1_raw_collection` columns if the components don't map onto the existing ones (`licenseFeeLf`, `mgrAmount`, `basicLicenseFeeBlf`, `considerationFee`, `mgqQuantity`, `compositeLfFl/Beer`, `compositeMgrFl/Beer`, `specialBeerLf/Mgr`). Needs a real migration file if any new column is required — see `migrations/`. |
| Validation | `apps/web/src/lib/validate.ts` — cross-field rules today: CL5CC requires `COUNTRY_LIQUOR`; `COMPOSITE_SHOP`'s four sub-components must sum to the stored totals. | New rule(s) only if HBR has its own conditional fields (an HBR equivalent of `hasCl5cc`, for example). |
| Excel template | `apps/web/src/lib/excel.ts` — `SHOP_TYPE_LABELS` (friendly dropdown label), `SHOP_TYPE_REVERSE` (label → enum on parse), `FIELD_GATES` (which financial columns are enabled per shop type, enforced by Excel data-validation formulas — see the M-31 write-up in summary.md for a real gotcha with boolean/text comparison in these formulas), `COLUMN_GUIDE` (Instructions sheet + header tooltips). | New label + reverse-map entry, new field gate(s), new template column(s) if new financial fields are added. |
| Admin display | `app/(admin)/admin/districts/[district]/page.tsx` — `SHOP_TYPES` (local const, duplicates the schema constant — should probably import from `@excise/schema` instead of redeclaring), `TYPE_LABEL`, `TYPE_BADGE` (DaisyUI badge color), the per-type breakdown bar. | New label + a badge color not already used (`badge-info`/`badge-accent`/`badge-success`/`badge-warning`/`badge-neutral` are all taken). |
| Verify page | `apps/web/app/(deo)/verify/page.tsx` — shop type dropdown/display during staged-row review. | Same enum addition flows through automatically once `SHOP_TYPES` is updated, but worth a UI pass to confirm the revenue-preview column renders correctly for the new formula. |
| Search | `apps/web/app/api/admin/search/route.ts` — `shopType` enum filter. | Automatic once the enum is extended — confirm the filter dropdown picks it up. |
| Docs | CLAUDE.md ("Shop Type Enum", "Revenue Formulas" table, "What Is Out of Scope"), roadmap.md (§1.4 "Explicit Scope Exclusions", §4 "Data Dictionary & Shop Classification Matrix", §5.6 schema notes), README.md ("Data Rules" section), `docs/templates/README.md` (financial columns by shop type table). | All need the exclusion reversed and the new formula/fields documented in the same level of detail as the existing five types. |

## Open questions to resolve once the department data arrives

1. **ID format** — does HBR use a distinct prefix/scheme from the existing `shop_id` convention (e.g. `AG0001`-style)? Does it need active format validation, or is free text fine?
2. **Revenue components** — what are the named financial fields (license fee? MGR? a flat annual fee like `ON_PREMISES_CONSUMPTION_FEE`? something else entirely)? Do any existing columns map cleanly, or does this need new `phase1_raw_collection` columns + a migration?
3. **Conditional sub-rules** — does HBR have anything analogous to CL5CC (a flag that unlocks extra fields) or COMPOSITE_SHOP (sub-components that must sum to a stored total)?
4. **Circle/sector, Thana, adjacency** — presumably HBR shops still register through the same `circle_sector_name` / `thana_name` / `adjacent_thanas_raw` fields as every other shop type (nothing so far suggests otherwise), but confirm.
5. **Existing data** — is there already a body of HBR data sitting somewhere (legacy spreadsheets, a separate system) that needs a one-time import, or does this launch clean via the normal DEO upload flow going forward?

## Next step

Wait for the department's HBR data (ID format, revenue formula, any conditional fields), then:
1. Update `packages/schema/src/constants.ts` and, if new financial fields are needed, `packages/schema/src/phase1.ts` + a new migration file.
2. Implement `computeRevenue()` and `validateRow()` changes.
3. Update the Excel template (`excel.ts`) and admin display (`district/page.tsx`).
4. Reverse the exclusion and document the new type across CLAUDE.md, roadmap.md, README.md, and `docs/templates/README.md` in the same detail as the existing five shop types.
5. Regenerate the DEO manual PDF (`docs/manual/`) once the Excel template changes, per TEST.md's existing recipe.
