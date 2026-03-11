import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

const createFeatureRequestSchema = z.object({
	title: z.string().min(1).max(200),
	rawPrompt: z.string().min(1),
	summary: z.string().optional(),
	rulesetReference: z.string().optional(),
});

const appendFeatureRequestMessageSchema = z.object({
	featureRequestId: z.string().uuid(),
	role: z.enum(["system", "assistant", "user"]),
	content: z.string().min(1),
	kind: z.enum(["conversation", "event", "note"]).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

const respondToApprovalSchema = z.object({
	approvalId: z.string().uuid(),
	action: z.enum(["approved", "rejected", "discarded"]),
	feedback: z.string().optional(),
});

const featureStudioStatusSchema = z.enum([
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
]);

const featureRequestSchema = z.object({
	id: z.string(),
	title: z.string(),
	status: featureStudioStatusSchema,
	summary: z.string().nullable(),
	rawPrompt: z.string(),
	rulesetReference: z.string().nullable(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]),
});

const featureRequestApprovalSchema = z.object({
	id: z.string(),
	featureRequestId: z.string(),
	approvalType: z.string(),
	status: z.enum(["pending", "approved", "rejected", "discarded"]),
	decisionNotes: z.string().nullable().optional(),
});

const featureRequestArtifactSchema = z.object({
	id: z.string(),
	kind: z.enum([
		"spec",
		"plan",
		"implementation_summary",
		"verification_report",
		"agent_qa_report",
		"human_qa_notes",
		"registration_manifest",
		"preview_metadata",
	]),
	version: z.number(),
	content: z.string(),
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
	createdAt: z.union([z.string(), z.date()]).optional(),
});

const featureRequestMessageSchema = z.object({
	id: z.string(),
	role: z.string(),
	content: z.string(),
	createdAt: z.union([z.string(), z.date()]),
});

const featureRequestWorktreeSchema = z.object({
	id: z.string(),
	branchName: z.string(),
	previewUrl: z.string().nullable(),
	previewStatus: z.string().nullable(),
	headCommitSha: z.string().nullable().optional(),
	lastVerifiedCommitSha: z.string().nullable().optional(),
	previewCommitSha: z.string().nullable().optional(),
});

const featureRequestDetailSchema = featureRequestSchema.extend({
	approvals: z.array(featureRequestApprovalSchema).optional(),
	messages: z.array(featureRequestMessageSchema).optional(),
	worktrees: z.array(featureRequestWorktreeSchema).optional(),
	artifacts: z.array(featureRequestArtifactSchema).optional(),
});

const featureRequestQueueSchema = z.object({
	requests: z.array(featureRequestSchema),
	pendingApprovals: z.array(featureRequestApprovalSchema),
});

const featureRegistrationSchema = z.object({
	id: z.string(),
	featureKey: z.string(),
	status: z.string(),
});

const featureCatalogEntrySchema = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
});

export const featureStudioContractRouter = t.router({
	createRequest: t.procedure
		.input(createFeatureRequestSchema)
		.mutation(() => Promise.resolve({} as z.infer<typeof featureRequestSchema>)),

	getRequest: t.procedure
		.input(z.object({ id: z.string().uuid() }))
		.query(() => Promise.resolve({} as z.infer<typeof featureRequestDetailSchema>)),

	listQueue: t.procedure
		.input(
			z
				.object({
					status: featureStudioStatusSchema.optional(),
				})
				.optional(),
		)
		.query(() => Promise.resolve({} as z.infer<typeof featureRequestQueueSchema>)),

	listReadyToRegister: t.procedure.query(() =>
		Promise.resolve([] as Array<z.infer<typeof featureRequestSchema>>),
	),

	appendMessage: t.procedure
		.input(appendFeatureRequestMessageSchema)
		.mutation(() =>
			Promise.resolve({} as z.infer<typeof featureRequestMessageSchema>),
		),

	respondToApproval: t.procedure
		.input(respondToApprovalSchema)
		.mutation(() =>
			Promise.resolve({} as z.infer<typeof featureRequestApprovalSchema>),
		),

	advance: t.procedure
		.input(z.object({ featureRequestId: z.string().uuid() }))
		.mutation(() => Promise.resolve({} as z.infer<typeof featureRequestDetailSchema>)),

	requestRegistrationApproval: t.procedure
		.input(z.object({ featureRequestId: z.string().uuid() }))
		.mutation(() =>
			Promise.resolve({} as z.infer<typeof featureRequestApprovalSchema>),
		),

	registerRequest: t.procedure
		.input(z.object({ featureRequestId: z.string().uuid() }))
		.mutation(() =>
			Promise.resolve({
				registration: {} as z.infer<typeof featureRegistrationSchema>,
				catalogFeature: {} as z.infer<typeof featureCatalogEntrySchema>,
			}),
		),
});

export type FeatureStudioContractRouter = typeof featureStudioContractRouter;
