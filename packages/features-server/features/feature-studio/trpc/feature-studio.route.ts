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
	completeImplementationSchema,
	createFeatureRequestSchema,
	failImplementationSchema,
	featureRequestIdSchema,
	listFeatureRequestsSchema,
	prepareImplementationSchema,
	registerFeatureRequestSchema,
	respondToApprovalSchema,
	requestRegistrationApprovalSchema,
} from "../dto";
import type {
	FeatureRegistrationService,
	FeatureRequestService,
	FeatureStudioRunnerService,
} from "../service";

const services = createServiceContainer<{
	featureRegistrationService: FeatureRegistrationService;
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

	listReadyToRegister: authProcedure.query(async () => {
		return services.get().featureRegistrationService.listReadyToRegister();
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

	prepareImplementation: authProcedure
		.input(prepareImplementationSchema)
		.mutation(async ({ input }) => {
			return services
				.get()
				.featureStudioRunnerService.prepareImplementation(
					input.featureRequestId,
					{
						agentType: input.agentType,
						workspaceId: input.workspaceId,
					},
				);
		}),

	completeImplementation: authProcedure
		.input(completeImplementationSchema)
		.mutation(async ({ input }) => {
			return services
				.get()
				.featureStudioRunnerService.completeImplementation(
					input.featureRequestId,
					{ summary: input.summary },
				);
		}),

	failImplementation: authProcedure
		.input(failImplementationSchema)
		.mutation(async ({ input }) => {
			return services
				.get()
				.featureStudioRunnerService.failImplementation(
					input.featureRequestId,
					input.error,
				);
		}),

	requestRegistrationApproval: authProcedure
		.input(requestRegistrationApprovalSchema)
		.mutation(async ({ input, ctx }) => {
			return services
				.get()
				.featureRegistrationService.requestRegistrationApproval(
					input.featureRequestId,
					getAuthUserId(ctx),
				);
		}),

	registerRequest: authProcedure
		.input(registerFeatureRequestSchema)
		.mutation(async ({ input }) => {
			return services
				.get()
				.featureRegistrationService.registerRequest(input.featureRequestId);
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
