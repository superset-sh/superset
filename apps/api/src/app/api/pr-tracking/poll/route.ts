import { db } from "@superset/db/client";
import { trackedBranches } from "@superset/db/schema";
import { captureEvent, flushPostHog } from "@superset/trpc/lib/posthog-client";
import { fetchPRForBranch } from "@superset/trpc/lib/github/pr-stats";
import { Receiver } from "@upstash/qstash";
import { and, eq, gt, sql } from "drizzle-orm";
import { env } from "@/env";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const BATCH_LIMIT = 50;

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const isValid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/pr-tracking/poll`,
	});

	if (!isValid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	console.log("[pr-tracking/poll] Starting PR tracking poll");

	// Fetch untracked branches created in the last 30 days
	const branches = await db.query.trackedBranches.findMany({
		where: and(
			eq(trackedBranches.diffTracked, false),
			gt(trackedBranches.createdAt, sql`now() - interval '30 days'`),
		),
		limit: BATCH_LIMIT,
	});

	console.log(`[pr-tracking/poll] Found ${branches.length} untracked branches`);

	let processedCount = 0;
	let mergedCount = 0;

	for (const branch of branches) {
		try {
			// Update lastPolledAt
			await db
				.update(trackedBranches)
				.set({ lastPolledAt: new Date() })
				.where(eq(trackedBranches.id, branch.id));

			const pr = await fetchPRForBranch({
				userId: branch.userId,
				repoOwner: branch.repoOwner,
				repoName: branch.repoName,
				branchName: branch.branchName,
			});

			if (!pr) {
				// No PR found for this branch yet
				processedCount++;
				continue;
			}

			if (pr.state === "MERGED") {
				// Capture PostHog event
				captureEvent({
					distinctId: branch.userId,
					event: "pr_merged",
					properties: {
						branch_name: branch.branchName,
						base_branch: branch.baseBranch,
						repo_owner: branch.repoOwner,
						repo_name: branch.repoName,
						pr_number: pr.number,
						pr_url: pr.url,
						additions: pr.additions,
						deletions: pr.deletions,
						changed_files: pr.changedFiles,
						merged_at: pr.mergedAt,
						branch_created_at: branch.createdAt.toISOString(),
					},
				});

				// Update tracked branch with PR data and mark as tracked
				await db
					.update(trackedBranches)
					.set({
						prNumber: pr.number,
						prState: pr.state,
						additions: pr.additions,
						deletions: pr.deletions,
						changedFiles: pr.changedFiles,
						mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : null,
						diffTracked: true,
					})
					.where(eq(trackedBranches.id, branch.id));

				mergedCount++;
				console.log(
					`[pr-tracking/poll] Tracked merged PR #${pr.number} for ${branch.repoOwner}/${branch.repoName}:${branch.branchName}`,
				);
			} else {
				// PR exists but not merged yet, update state
				await db
					.update(trackedBranches)
					.set({
						prNumber: pr.number,
						prState: pr.state,
					})
					.where(eq(trackedBranches.id, branch.id));
			}

			processedCount++;
		} catch (error) {
			console.error(
				`[pr-tracking/poll] Error processing branch ${branch.branchName}:`,
				error,
			);
		}
	}

	// Flush PostHog events
	await flushPostHog();

	console.log(
		`[pr-tracking/poll] Completed: processed=${processedCount}, merged=${mergedCount}`,
	);

	return Response.json({
		success: true,
		processed: processedCount,
		merged: mergedCount,
	});
}
