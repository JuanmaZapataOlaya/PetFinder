-- Add guardrail-specific cost tracking columns
alter table claim_validation_costs
add column guardrail_1_input_tokens integer default 0,
add column guardrail_1_output_tokens integer default 0,
add column guardrail_1_cost numeric default 0,
add column guardrail_2_input_tokens integer default 0,
add column guardrail_2_output_tokens integer default 0,
add column guardrail_2_cost numeric default 0;

-- Create index for cost analysis queries
create index idx_claim_validation_costs_guardrails on claim_validation_costs(guardrail_1_cost, guardrail_2_cost);
