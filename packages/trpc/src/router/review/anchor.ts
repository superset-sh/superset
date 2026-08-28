import { db } from "@superset/db/client";
import { pages, pageVersions, reviewPages } from "@superset/db/schema";
import type { ParsedGithubPullRequestUrl } from "@superset/shared/github-pr-url";
import { TRPCError } from "@trpc/server";
import { del } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

// `parseGithubPullRequestUrl` already lowercases owner/repo, so the triple is
// safe to compare and store as-is — the org boundary is the organizationId
// column itself, no cross-org ownership check needed.
const anchorFilter = (organizationId: string, pr: ParsedGithubPullRequestUrl) =>
	and(
		eq(reviewPages.organizationId, organizationId),
		eq(reviewPages.repoOwner, pr.owner),
		eq(reviewPages.repoName, pr.repo),
		eq(reviewPages.prNumber, pr.number),
	);

export async function findLinkedPageId(
	organizationId: string,
	pr: ParsedGithubPullRequestUrl,
): Promise<string | null> {
	const [row] = await db
		.select({ pageId: reviewPages.pageId })
		.from(reviewPages)
		.where(anchorFilter(organizationId, pr))
		.limit(1);
	return row?.pageId ?? null;
}

// Cleans up a page this call just created but lost the race to link — the
// alternative is a permanent orphaned, org-visible page with a wasted blob
// upload sitting around forever. Doesn't prevent the race itself (that would
// need a lock spanning publishPage's own transaction), just bounds the harm.
async function deleteOrphanedPage(pageId: string): Promise<void> {
	const rows = await db
		.select({ blobPathname: pageVersions.blobPathname })
		.from(pageVersions)
		.where(eq(pageVersions.pageId, pageId));

	await db.delete(pages).where(eq(pages.id, pageId));

	const pathnames = rows.map((row) => row.blobPathname);
	if (pathnames.length > 0) {
		try {
			await del(pathnames);
		} catch (error) {
			console.error("[reviews] blob cleanup failed after orphan delete", {
				pageId,
				pathnames,
				error,
			});
		}
	}
}

// A no-op if this PR is already linked to `pageId` (the common re-review
// case); a genuine conflict only if it is linked to some other page — which
// `findLinkedPageId` should have caught before `publishPage` ran, so this is
// just the race between that read and this write.
export async function linkReviewPage({
	organizationId,
	pr,
	pageId,
}: {
	organizationId: string;
	pr: ParsedGithubPullRequestUrl;
	pageId: string;
}): Promise<void> {
	const [inserted] = await db
		.insert(reviewPages)
		.values({
			organizationId,
			repoOwner: pr.owner,
			repoName: pr.repo,
			prNumber: pr.number,
			pageId,
		})
		.onConflictDoNothing({
			target: [
				reviewPages.organizationId,
				reviewPages.repoOwner,
				reviewPages.repoName,
				reviewPages.prNumber,
			],
		})
		.returning();
	if (inserted) return;

	const existing = await findLinkedPageId(organizationId, pr);
	if (existing !== pageId) {
		await deleteOrphanedPage(pageId);
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"Someone else has already published a review for this PR — retry to add a version to theirs.",
		});
	}
}
