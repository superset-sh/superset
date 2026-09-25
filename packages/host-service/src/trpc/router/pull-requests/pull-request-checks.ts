import { z } from "zod";
import {
	computeChecksStatus,
	parseCheckContexts,
} from "../../../runtime/pull-requests/utils/pull-request-mappers";

const checkRunSchema = z.object({
	__typename: z.literal("CheckRun").optional().default("CheckRun"),
	name: z.string(),
	status: z.string(),
	conclusion: z.string().nullable().optional().default(null),
	detailsUrl: z.string().nullable().optional().default(null),
	startedAt: z.string().nullable().optional().default(null),
	completedAt: z.string().nullable().optional().default(null),
	checkSuite: z
		.object({
			workflowRun: z.object({ databaseId: z.number().nullable() }).nullable(),
		})
		.nullable()
		.optional()
		.default(null),
});

const statusContextSchema = z.object({
	__typename: z.literal("StatusContext").optional().default("StatusContext"),
	context: z.string(),
	state: z.string(),
	targetUrl: z.string().nullable().optional().default(null),
	createdAt: z.string().nullable().optional().default(null),
});

export const pullRequestCheckContextSchema = z.union([
	checkRunSchema,
	statusContextSchema,
]);

export function normalizePullRequestChecks(raw: unknown) {
	const nodes = z.array(pullRequestCheckContextSchema).parse(raw ?? []);
	const checks = parseCheckContexts(nodes);
	return { checks, checksStatus: computeChecksStatus(checks) };
}
