import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
	InjectDrizzle,
	type DrizzleDB,
	featureRequestApprovals,
	featureRequestArtifacts,
	featureRequestRuns,
	featureRequests,
} from "@superbuilder/drizzle";
import {
	generateFeatureStudioPlan,
	generateFeatureStudioSpec,
} from "@superset/agent";
import { WorktreeExecutionService } from "./worktree-execution.service";

@Injectable()
export class FeatureStudioRunnerService {
	constructor(
		@InjectDrizzle() private readonly db: DrizzleDB,
		private readonly worktreeExecutionService: WorktreeExecutionService,
	) {}

	async advance(featureRequestId: string) {
		const request = await this.db.query.featureRequests.findFirst({
			where: eq(featureRequests.id, featureRequestId),
		});

		if (!request) {
			throw new NotFoundException(
				`Feature request not found: ${featureRequestId}`,
			);
		}

		switch (request.status) {
			case "draft":
				return this.generateSpecAndPlan(featureRequestId);
			case "plan_approved":
				return this.worktreeExecutionService.prepareWorktree({
					featureRequestId,
				});
			default:
				return request;
		}
	}

	private async generateSpecAndPlan(featureRequestId: string) {
		const request = await this.db.query.featureRequests.findFirst({
			where: eq(featureRequests.id, featureRequestId),
		});

		if (!request) {
			throw new NotFoundException(
				`Feature request not found: ${featureRequestId}`,
			);
		}

		const [run] = await this.db
			.insert(featureRequestRuns)
			.values({
				featureRequestId: request.id,
				workflowName: "feature-studio",
				workflowStep: "generate_spec_and_plan",
				status: "running",
			})
			.returning();

		const spec = await generateFeatureStudioSpec({
			title: request.title,
			rawPrompt: request.rawPrompt,
			rulesetReference: request.rulesetReference ?? undefined,
		});
		const plan = await generateFeatureStudioPlan({
			title: request.title,
			rawPrompt: request.rawPrompt,
			rulesetReference: request.rulesetReference ?? undefined,
			spec,
		});

		await this.db.insert(featureRequestArtifacts).values({
			featureRequestId,
			kind: "spec",
			version: 1,
			content: spec,
			metadata: run ? { runId: run.id } : null,
			createdById: request.createdById,
		});

		await this.db.insert(featureRequestArtifacts).values({
			featureRequestId,
			kind: "plan",
			version: 1,
			content: plan,
			metadata: run ? { runId: run.id } : null,
			createdById: request.createdById,
		});

		await this.db.insert(featureRequestApprovals).values({
			featureRequestId,
			approvalType: "spec_plan",
			status: "pending",
			requestedFromId: request.createdById,
			approvedArtifactVersion: 1,
		});

		const [updated] = await this.db
			.update(featureRequests)
			.set({
				status: "pending_spec_approval",
				currentRunId: run?.id ?? null,
			})
			.where(eq(featureRequests.id, request.id))
			.returning();

		if (!updated) {
			throw new Error("Failed to update feature request status");
		}

		return updated;
	}

	async resumeAfterApproval(approvalId: string) {
		const approval = await this.db.query.featureRequestApprovals.findFirst({
			where: eq(featureRequestApprovals.id, approvalId),
		});

		if (!approval) {
			throw new NotFoundException(`Approval not found: ${approvalId}`);
		}

		if (approval.status !== "approved") {
			return approval;
		}

		const nextStatus = this.resolveApprovedStatus(approval.approvalType);
		if (!nextStatus) {
			return approval;
		}

		const [updated] = await this.db
			.update(featureRequests)
			.set({
				status: nextStatus,
			})
			.where(eq(featureRequests.id, approval.featureRequestId))
			.returning();

		if (!updated) {
			throw new Error("Failed to resume request after approval");
		}

		return updated;
	}

	private resolveApprovedStatus(
		approvalType: (typeof featureRequestApprovals.$inferSelect)["approvalType"],
	): (typeof featureRequests.$inferSelect)["status"] | null {
		switch (approvalType) {
			case "spec_plan":
				return "plan_approved";
			case "human_qa":
				return "customization";
			default:
				return null;
		}
	}
}
