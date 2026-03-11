import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
	InjectDrizzle,
	type DrizzleDB,
	featureRequestApprovals,
	featureRequestArtifacts,
	featureRequests,
} from "@superbuilder/drizzle";

export interface BrowserQaCheckInput {
	label: string;
	path?: string;
}

export interface RunBrowserQaInput {
	featureRequestId: string;
	previewUrl: string;
	checks?: BrowserQaCheckInput[];
}

export interface AgentQaReport {
	previewUrl: string;
	checks: Array<{
		label: string;
		status: "passed" | "failed";
		note?: string;
	}>;
	summary: string;
}

@Injectable()
export class BrowserQaService {
	constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

	async runPreviewChecks(input: RunBrowserQaInput): Promise<AgentQaReport> {
		const request = await this.db.query.featureRequests.findFirst({
			where: eq(featureRequests.id, input.featureRequestId),
		});

		if (!request) {
			throw new Error(`Feature request not found: ${input.featureRequestId}`);
		}

		const declaredChecks = input.checks?.length
			? input.checks
			: [{ label: "Preview responds", path: "/" }];

		const checks: AgentQaReport["checks"] = [];

		for (const check of declaredChecks) {
			const targetUrl = new URL(check.path ?? "/", input.previewUrl).toString();
			const response = await fetch(targetUrl);

			checks.push({
				label: check.label,
				status: response.ok ? "passed" : "failed",
				note: response.ok
					? undefined
					: `HTTP ${response.status} returned for ${targetUrl}`,
			});
		}

		const passedCount = checks.filter((check) => check.status === "passed").length;
		const summary = `${passedCount}/${checks.length} checks passed`;
		const report: AgentQaReport = {
			previewUrl: input.previewUrl,
			checks,
			summary,
		};

		await this.db.insert(featureRequestArtifacts).values({
			featureRequestId: input.featureRequestId,
			kind: "agent_qa_report",
			version: 1,
			content: JSON.stringify(report, null, 2),
			metadata: {
				checkCount: checks.length,
			},
		});

		await this.db.insert(featureRequestApprovals).values({
			featureRequestId: input.featureRequestId,
			approvalType: "human_qa",
			status: "pending",
			requestedFromId: request.createdById,
		});

		await this.db
			.update(featureRequests)
			.set({
				status: "pending_human_qa",
			})
			.where(eq(featureRequests.id, input.featureRequestId));

		return report;
	}
}
