BEGIN;

CREATE TABLE public.claim_validation_costs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	notification_id UUID REFERENCES public.app_notifications(id) ON DELETE SET NULL,

	guard_input_tokens BIGINT NOT NULL CHECK (guard_input_tokens >= 0),
	guard_output_tokens BIGINT NOT NULL CHECK (guard_output_tokens >= 0),
	guard_cost NUMERIC(12, 8) NOT NULL CHECK (guard_cost >= 0),

	agent_input_tokens BIGINT CHECK (agent_input_tokens IS NULL OR agent_input_tokens >= 0),
	agent_output_tokens BIGINT CHECK (agent_output_tokens IS NULL OR agent_output_tokens >= 0),
	agent_cost NUMERIC(12, 8) CHECK (agent_cost IS NULL OR agent_cost >= 0),

	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

	CONSTRAINT claim_validation_costs_agent_data_consistent CHECK (
		(agent_input_tokens IS NULL AND agent_output_tokens IS NULL AND agent_cost IS NULL)
		OR (agent_input_tokens IS NOT NULL AND agent_output_tokens IS NOT NULL AND agent_cost IS NOT NULL)
	)
);

CREATE INDEX claim_validation_costs_notification_id_idx
	ON public.claim_validation_costs (notification_id);

COMMENT ON TABLE public.claim_validation_costs IS
	'Costo y consumo de tokens de cada intento de validación de un reclamo de mascota.';
COMMENT ON COLUMN public.claim_validation_costs.guard_cost IS
	'Costo del guard Gemini 3.1 Flash-Lite en USD: input $0.25/1M y output $1.50/1M.';
COMMENT ON COLUMN public.claim_validation_costs.agent_cost IS
	'Costo del agente principal Gemini 3.5 Flash-Lite en USD: input $0.30/1M y output $2.50/1M.';
COMMENT ON COLUMN public.claim_validation_costs.notification_id IS
	'Solicitud asociada cuando el guard permite continuar; queda NULL si la solicitud fue rechazada o eliminada.';

ALTER TABLE public.claim_validation_costs ENABLE ROW LEVEL SECURITY;

COMMIT;
