import { z } from "zod";

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

export type RespondToApprovalDto = z.infer<typeof respondToApprovalSchema>;
