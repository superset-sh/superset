import { z } from "zod";
import { AGENT_TYPES } from "@superset/shared/agent-command";

export const listFeatureRequestsSchema = z
	.object({
		status: z
			.enum([
				"draft",
				"spec_ready",
				"pending_spec_approval",
				"plan_approved",
				"implementing",
				"verifying",
				"preview_deploying",
				"agent_qa",
				"pending_human_qa",
				"customization",
				"pending_registration",
				"registered",
				"failed",
				"discarded",
			])
			.optional(),
	})
	.optional();

export const respondToApprovalSchema = z.object({
	approvalId: z.string().uuid(),
	action: z.enum(["approved", "rejected", "discarded"]),
	feedback: z.string().optional(),
});

export const featureRequestIdSchema = z.object({
	id: z.string().uuid(),
});

export const advanceFeatureRequestSchema = z.object({
	featureRequestId: z.string().uuid(),
});

export const requestRegistrationApprovalSchema = z.object({
	featureRequestId: z.string().uuid(),
});

export const registerFeatureRequestSchema = z.object({
	featureRequestId: z.string().uuid(),
});

export const prepareImplementationSchema = z.object({
	featureRequestId: z.string().uuid(),
	agentType: z.enum(AGENT_TYPES).optional(),
	workspaceId: z.string().min(1).optional(),
});

export const completeImplementationSchema = z.object({
	featureRequestId: z.string().uuid(),
	summary: z.string().optional(),
});

export const failImplementationSchema = z.object({
	featureRequestId: z.string().uuid(),
	error: z.string().min(1),
});

export type RespondToApprovalDto = z.infer<typeof respondToApprovalSchema>;
