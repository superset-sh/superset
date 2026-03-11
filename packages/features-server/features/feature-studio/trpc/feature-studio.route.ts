import { z } from "zod";
import {
	authProcedure,
	createServiceContainer,
	getAuthUserId,
	router,
} from "../../../core/trpc";
import {
	advanceFeatureRequestSchema,
	appendFeatureRequestMessageSchema,
	createFeatureRequestSchema,
	featureRequestIdSchema,
	listFeatureRequestsSchema,
	respondToApprovalSchema,
} from "../dto";
import type { FeatureRequestService } from "../service";
import type { FeatureStudioRunnerService } from "../service";

const services = createServiceContainer<{
	featureRequestService: FeatureRequestService;
	featureStudioRunnerService: FeatureStudioRunnerService;
}>();

export const injectFeatureStudioServices = services.inject;

export const featureStudioRouter = router({
	createRequest: authProcedure
		.input(createFeatureRequestSchema)
		.mutation(async ({ input, ctx }) => {
			const userId = getAuthUserId(ctx);
			return services.get().featureRequestService.createRequest(input, userId);
		}),

	getRequest: authProcedure
		.input(featureRequestIdSchema)
		.query(async ({ input }) => {
			return services.get().featureRequestService.getRequest(input.id);
		}),

	listRequests: authProcedure
		.input(listFeatureRequestsSchema)
		.query(async ({ input }) => {
			return services
				.get()
				.featureRequestService.listRequests(input ?? undefined);
		}),

	listQueue: authProcedure
		.input(listFeatureRequestsSchema)
		.query(async ({ input }) => {
			return services.get().featureRequestService.listQueue(input ?? undefined);
		}),

	listApprovals: authProcedure.query(async () => {
		return services.get().featureRequestService.listApprovals();
	}),

	appendMessage: authProcedure
		.input(appendFeatureRequestMessageSchema)
		.mutation(async ({ input }) => {
			return services.get().featureRequestService.appendMessage(input);
		}),

	respondToApproval: authProcedure
		.input(respondToApprovalSchema)
		.mutation(async ({ input, ctx }) => {
			const userId = getAuthUserId(ctx);
			const approval = await services
				.get()
				.featureRequestService.respondToApproval({
					approvalId: input.approvalId,
					action: input.action,
					feedback: input.feedback,
					decidedById: userId,
				});

			if (input.action === "approved") {
				await services
					.get()
					.featureStudioRunnerService.resumeAfterApproval(input.approvalId);
			}

			return approval;
		}),

	advance: authProcedure
		.input(advanceFeatureRequestSchema)
		.mutation(async ({ input }) => {
			return services
				.get()
				.featureStudioRunnerService.advance(input.featureRequestId);
		}),

	listStatuses: authProcedure.query(() => {
		return z.enum([
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
		]).options;
	}),
});

export type FeatureStudioRouter = typeof featureStudioRouter;
