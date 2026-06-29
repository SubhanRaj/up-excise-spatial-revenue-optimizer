-- on_premises_consumption_fee is fixed at INR 300,000 for all MODEL_SHOP licences.
-- storing a constant per row is wasteful; it is now a named constant in the revenue formula.
ALTER TABLE phase1_raw_collection DROP COLUMN premises_consideration_fee;
