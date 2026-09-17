-- Make old guard columns nullable to support new guardrail split
alter table claim_validation_costs
alter column guard_input_tokens drop not null,
alter column guard_output_tokens drop not null,
alter column guard_cost drop not null;
