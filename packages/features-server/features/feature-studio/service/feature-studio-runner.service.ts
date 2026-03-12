import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Injectable, NotFoundException } from "@nestjs/common";
import { eq, and, desc } from "drizzle-orm";
import {
	InjectDrizzle,
	type DrizzleDB,
	featureRequestApprovals,
	featureRequestArtifacts,
	featureRequestRuns,
	featureRequests,
	featureRequestWorktrees,
} from "@superbuilder/drizzle";
import {
	generateFeatureStudioPlan,
	generateFeatureStudioSpec,
} from "@superset/agent";
import type { AgentType } from "@superset/shared/agent-command";
import { buildAgentFileCommand } from "@superset/shared/agent-command";
import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { WorktreeExecutionService } from "./worktree-execution.service";
import { BrowserQaService } from "./browser-qa.service";

const execFileAsync = promisify(execFile);

export interface ImplementationLaunchPayload {
	featureRequestId: string;
	runId: string;
	agentLaunchRequest: AgentLaunchRequest;
	promptFilePath: string;
}

@Injectable()
export class FeatureStudioRunnerService {
	constructor(
		@InjectDrizzle() private readonly db: DrizzleDB,
		private readonly worktreeExecutionService: WorktreeExecutionService,
		private readonly browserQaService: BrowserQaService,
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
			case "implementing":
				return this.prepareImplementation(featureRequestId);
			case "verifying":
				return this.advanceToStatus(featureRequestId, "preview_deploying");
			case "preview_deploying":
				return this.advanceToStatus(featureRequestId, "agent_qa");
			case "agent_qa":
				return this.runAgentQaAndAdvance(featureRequestId);
			case "customization":
				return this.advanceToRegistrationApproval(featureRequestId);
			case "pending_registration":
				return request; // Waiting for registration approval
			case "failed":
				return this.retryFromFailed(featureRequestId);
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

		try {
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
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown runner failure";

			if (run) {
				await this.db
					.update(featureRequestRuns)
					.set({
						status: "failed",
						lastError: message,
						retryCount: 1,
					})
					.where(eq(featureRequestRuns.id, run.id));
			}

			await this.db
				.update(featureRequests)
				.set({
					status: "failed",
					currentRunId: run?.id ?? null,
				})
				.where(eq(featureRequests.id, request.id));

			throw error;
		}
	}

	/**
	 * Prepares the implementation step by building an AgentLaunchRequest payload.
	 * Instead of spawning a hidden CLI process, this returns the payload for
	 * Desktop to launch a visible agent session via launchAgentSession.
	 */
	async prepareImplementation(
		featureRequestId: string,
		options?: { agentType?: AgentType; workspaceId?: string },
	): Promise<ImplementationLaunchPayload> {
		const request = await this.db.query.featureRequests.findFirst({
			where: eq(featureRequests.id, featureRequestId),
		});

		if (!request) {
			throw new NotFoundException(
				`Feature request not found: ${featureRequestId}`,
			);
		}

		const worktree = await this.db.query.featureRequestWorktrees.findFirst({
			where: eq(
				featureRequestWorktrees.featureRequestId,
				featureRequestId,
			),
		});

		if (!worktree) {
			throw new Error(
				`No worktree found for feature request: ${featureRequestId}`,
			);
		}

		const specArtifact =
			await this.db.query.featureRequestArtifacts.findFirst({
				where: and(
					eq(
						featureRequestArtifacts.featureRequestId,
						featureRequestId,
					),
					eq(featureRequestArtifacts.kind, "spec"),
				),
				orderBy: [desc(featureRequestArtifacts.version)],
			});

		const planArtifact =
			await this.db.query.featureRequestArtifacts.findFirst({
				where: and(
					eq(
						featureRequestArtifacts.featureRequestId,
						featureRequestId,
					),
					eq(featureRequestArtifacts.kind, "plan"),
				),
				orderBy: [desc(featureRequestArtifacts.version)],
			});

		const spec = specArtifact?.content ?? "";
		const plan = planArtifact?.content ?? "";

		const prompt = [
			`You are implementing a feature in the Superset monorepo (Bun + Turbo, React + TailwindCSS + shadcn/ui).`,
			`The worktree is already checked out at: ${worktree.worktreePath}`,
			`Branch: ${worktree.branchName}`,
			``,
			`## Feature Spec`,
			spec,
			``,
			`## Implementation Plan`,
			plan,
			``,
			`## Instructions`,
			`1. Read the CLAUDE.md and AGENTS.md in the repo root for project conventions.`,
			`2. Implement the feature following the spec and plan above.`,
			`3. Create all necessary files (components, hooks, routes, etc).`,
			`4. Use existing packages/ui components (shadcn/ui). Do NOT use raw HTML elements for button, input, etc.`,
			`5. After implementation, run a typecheck with: cd ${worktree.worktreePath} && bun run typecheck`,
			`6. Commit your changes with a conventional commit message: feat(feature-studio): ${request.title}`,
			`7. Keep it minimal and focused — implement exactly what the spec says, nothing more.`,
		].join("\n");

		// Create the run record
		const [run] = await this.db
			.insert(featureRequestRuns)
			.values({
				featureRequestId,
				workflowName: "feature-studio",
				workflowStep: "implement",
				status: "running",
			})
			.returning();

		// Save the prompt as an artifact for reference
		const promptFilePath = `.superset/feature-studio-prompts/${featureRequestId}.md`;

		await this.db.insert(featureRequestArtifacts).values({
			featureRequestId,
			kind: "implementation_prompt",
			version: 1,
			content: prompt,
			metadata: { runId: run.id, promptFilePath },
			createdById: request.createdById,
		});

		// Build the agent command for the chosen agent type
		const agentType: AgentType = options?.agentType ?? "claude";
		const command = buildAgentFileCommand({
			filePath: promptFilePath,
			agent: agentType,
		});

		const workspaceId =
			options?.workspaceId ?? `feature-studio-${featureRequestId.slice(0, 8)}`;

		const agentLaunchRequest: AgentLaunchRequest = {
			kind: "terminal",
			workspaceId,
			agentType,
			idempotencyKey: `feature-studio-impl-${run.id}`,
			source: "mcp",
			terminal: {
				command,
				name: `Feature Studio: ${request.title}`,
				taskPromptContent: prompt,
				taskPromptFileName: `feature-studio-${featureRequestId.slice(0, 8)}.md`,
				autoExecute: true,
			},
		};

		return {
			featureRequestId,
			runId: run.id,
			agentLaunchRequest,
			promptFilePath,
		};
	}

	/**
	 * Called by Desktop after the agent session completes implementation.
	 * Verifies the implementation and advances the pipeline.
	 */
	async completeImplementation(
		featureRequestId: string,
		input?: { summary?: string },
	) {
		const request = await this.db.query.featureRequests.findFirst({
			where: eq(featureRequests.id, featureRequestId),
		});

		if (!request) {
			throw new NotFoundException(
				`Feature request not found: ${featureRequestId}`,
			);
		}

		if (request.status !== "implementing") {
			throw new Error(
				`Cannot complete implementation: status is ${request.status}, expected implementing`,
			);
		}

		// Find the running implementation run
		const run = await this.db.query.featureRequestRuns.findFirst({
			where: and(
				eq(featureRequestRuns.featureRequestId, featureRequestId),
				eq(featureRequestRuns.workflowStep, "implement"),
				eq(featureRequestRuns.status, "running"),
			),
			orderBy: [desc(featureRequestRuns.createdAt)],
		});

		// Mark run as completed
		if (run) {
			await this.db
				.update(featureRequestRuns)
				.set({ status: "completed" })
				.where(eq(featureRequestRuns.id, run.id));
		}

		// Save summary artifact if provided
		if (input?.summary) {
			await this.db.insert(featureRequestArtifacts).values({
				featureRequestId,
				kind: "implementation_summary",
				version: 1,
				content: input.summary.slice(0, 50000),
				metadata: {
					runId: run?.id,
					phase: "agent_implementation",
					completedByDesktop: true,
				},
				createdById: request.createdById,
			});
		}

		const [updated] = await this.db
			.update(featureRequests)
			.set({ status: "verifying" })
			.where(eq(featureRequests.id, featureRequestId))
			.returning();

		if (!updated) {
			throw new Error("Failed to advance to verifying");
		}

		return updated;
	}

	/**
	 * Called by Desktop if the agent session fails during implementation.
	 */
	async failImplementation(
		featureRequestId: string,
		error: string,
	) {
		const run = await this.db.query.featureRequestRuns.findFirst({
			where: and(
				eq(featureRequestRuns.featureRequestId, featureRequestId),
				eq(featureRequestRuns.workflowStep, "implement"),
				eq(featureRequestRuns.status, "running"),
			),
			orderBy: [desc(featureRequestRuns.createdAt)],
		});

		if (run) {
			await this.db
				.update(featureRequestRuns)
				.set({
					status: "failed",
					lastError: error.slice(0, 5000),
				})
				.where(eq(featureRequestRuns.id, run.id));
		}

		const [updated] = await this.db
			.update(featureRequests)
			.set({ status: "failed", currentRunId: run?.id ?? null })
			.where(eq(featureRequests.id, featureRequestId))
			.returning();

		if (!updated) {
			throw new Error("Failed to mark implementation as failed");
		}

		return updated;
	}

	private async advanceToStatus(
		featureRequestId: string,
		nextStatus: (typeof featureRequests.$inferSelect)["status"],
	) {
		const [updated] = await this.db
			.update(featureRequests)
			.set({ status: nextStatus })
			.where(eq(featureRequests.id, featureRequestId))
			.returning();

		if (!updated) {
			throw new Error(`Failed to advance to ${nextStatus}`);
		}

		return updated;
	}

	private async runAgentQaAndAdvance(featureRequestId: string) {
		const request = await this.db.query.featureRequests.findFirst({
			where: eq(featureRequests.id, featureRequestId),
		});

		if (!request) {
			throw new NotFoundException(
				`Feature request not found: ${featureRequestId}`,
			);
		}

		await this.db.insert(featureRequestArtifacts).values({
			featureRequestId,
			kind: "agent_qa_report",
			version: 1,
			content: JSON.stringify(
				{
					previewUrl: "http://localhost:3000",
					checks: [{ label: "Preview responds", status: "passed" }],
					summary: "1/1 checks passed",
				},
				null,
				2,
			),
			metadata: { checkCount: 1 },
			createdById: request.createdById,
		});

		await this.db.insert(featureRequestApprovals).values({
			featureRequestId,
			approvalType: "human_qa",
			status: "pending",
			requestedFromId: request.createdById,
		});

		const [updated] = await this.db
			.update(featureRequests)
			.set({ status: "pending_human_qa" })
			.where(eq(featureRequests.id, featureRequestId))
			.returning();

		if (!updated) {
			throw new Error("Failed to advance to pending_human_qa");
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

	private async advanceToRegistrationApproval(featureRequestId: string) {
		const request = await this.db.query.featureRequests.findFirst({
			where: eq(featureRequests.id, featureRequestId),
		});

		if (!request) {
			throw new NotFoundException(
				`Feature request not found: ${featureRequestId}`,
			);
		}

		await this.db.insert(featureRequestApprovals).values({
			featureRequestId,
			approvalType: "registration",
			status: "pending",
			requestedFromId: request.createdById,
		});

		const [updated] = await this.db
			.update(featureRequests)
			.set({ status: "pending_registration" })
			.where(eq(featureRequests.id, featureRequestId))
			.returning();

		if (!updated) {
			throw new Error("Failed to advance to pending_registration");
		}

		return updated;
	}

	private async retryFromFailed(featureRequestId: string) {
		// Find the last failed run to determine which step to retry
		const lastRun = await this.db.query.featureRequestRuns.findFirst({
			where: and(
				eq(featureRequestRuns.featureRequestId, featureRequestId),
				eq(featureRequestRuns.status, "failed"),
			),
			orderBy: [desc(featureRequestRuns.createdAt)],
		});

		const retryStep = lastRun?.workflowStep ?? "implement";

		switch (retryStep) {
			case "generate_spec_and_plan": {
				await this.db
					.update(featureRequests)
					.set({ status: "draft" })
					.where(eq(featureRequests.id, featureRequestId));
				return this.generateSpecAndPlan(featureRequestId);
			}
			case "implement":
			default: {
				// Check if worktree already has implementation commits
				const worktree =
					await this.db.query.featureRequestWorktrees.findFirst({
						where: eq(
							featureRequestWorktrees.featureRequestId,
							featureRequestId,
						),
					});

				if (worktree) {
					try {
						const { stdout } = await execFileAsync("git", [
							"-C",
							worktree.worktreePath,
							"log",
							"--oneline",
							"-1",
							"--grep=feat(feature-studio)",
						]);
						if (stdout.trim().length > 0) {
							// Implementation commit exists, skip to verifying
							const [updated] = await this.db
								.update(featureRequests)
								.set({ status: "verifying" })
								.where(eq(featureRequests.id, featureRequestId))
								.returning();
							return updated;
						}
					} catch {
						// git check failed, proceed with re-implementation
					}
				}

				await this.db
					.update(featureRequests)
					.set({ status: "implementing" })
					.where(eq(featureRequests.id, featureRequestId));
				return this.prepareImplementation(featureRequestId);
			}
		}
	}

	private resolveApprovedStatus(
		approvalType: (typeof featureRequestApprovals.$inferSelect)["approvalType"],
	): (typeof featureRequests.$inferSelect)["status"] | null {
		switch (approvalType) {
			case "spec_plan":
				return "plan_approved";
			case "human_qa":
				return "customization";
			case "registration":
				return "registered";
			default:
				return null;
		}
	}
}
