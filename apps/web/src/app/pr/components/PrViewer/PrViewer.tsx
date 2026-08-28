"use client";

import { parseGithubPullRequestUrl } from "@superset/shared/github-pr-url";
import { renderReviewReportHtml } from "@superset/shared/review-report";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";

function errorInfo(error: unknown): { message: string; unauthorized: boolean } {
	if (error instanceof TRPCClientError) {
		return {
			message: error.message,
			unauthorized: error.data?.code === "UNAUTHORIZED",
		};
	}
	return {
		message: "Something went wrong loading this pull request.",
		unauthorized: false,
	};
}

export function PrViewer() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const trpc = useTRPC();

	const urlParam = searchParams.get("url") ?? "";
	const [inputValue, setInputValue] = useState(urlParam);
	const isValidUrl = parseGithubPullRequestUrl(urlParam) !== null;

	const query = useQuery({
		...trpc.githubPr.fetchByUrl.queryOptions({ prUrl: urlParam }),
		enabled: isValidUrl,
		retry: false,
	});

	const html = useMemo(() => {
		const pr = query.data;
		if (!pr) return null;
		return renderReviewReportHtml({
			title: pr.title,
			repo: `${pr.owner}/${pr.repo}`,
			prNumber: pr.number,
			prUrl: pr.htmlUrl,
			branch: pr.headBranch,
			generatedAt: pr.updatedAt,
			// Same precedence as the app's normalizePRState: draft wins.
			prState: pr.isDraft ? "draft" : pr.merged ? "merged" : pr.state,
			authorLogin: pr.authorLogin,
			authorAvatarUrl: pr.authorAvatarUrl,
			createdAt: pr.createdAt,
			// "" (not undefined) so a body-less PR still renders as a plain PR
			// view — "No description provided." — never the findings empty state.
			description: pr.description ?? "",
			checks: pr.checks,
			diff: pr.diff,
			comments: pr.comments.map((comment) => ({
				authorLogin: comment.authorLogin,
				authorAvatarUrl: comment.authorAvatarUrl,
				body: comment.body,
				createdAt: comment.createdAt,
				htmlUrl: comment.htmlUrl,
			})),
		});
	}, [query.data]);

	function navigateTo(value: string) {
		const trimmed = value.trim();
		const params = new URLSearchParams(searchParams);
		if (trimmed) params.set("url", trimmed);
		else params.delete("url");
		router.push(`/pr${params.size > 0 ? `?${params.toString()}` : ""}`);
	}

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		navigateTo(inputValue);
	}

	const searchForm = (
		<form onSubmit={handleSubmit} className="flex w-full gap-2">
			<Input
				value={inputValue}
				onChange={(event) => setInputValue(event.target.value)}
				placeholder="https://github.com/owner/repo/pull/123"
				aria-label="GitHub pull request URL"
			/>
			<Button type="submit">View</Button>
		</form>
	);

	if (!urlParam || !isValidUrl) {
		return (
			<div className="flex h-dvh flex-col items-center justify-center gap-4 px-4">
				<div className="w-full max-w-md space-y-3">
					<h1 className="text-center font-semibold text-xl">
						View a pull request
					</h1>
					<p className="text-center text-muted-foreground text-sm">
						Paste a GitHub pull request link to view its description and diff.
					</p>
					{searchForm}
					{urlParam && !isValidUrl ? (
						<p className="text-center text-destructive text-sm">
							That doesn't look like a github.com pull request link.
						</p>
					) : null}
				</div>
			</div>
		);
	}

	if (query.isPending) {
		return (
			<div className="flex h-dvh items-center justify-center text-muted-foreground text-sm">
				Loading pull request…
			</div>
		);
	}

	if (query.isError) {
		const { message, unauthorized } = errorInfo(query.error);
		return (
			<div className="flex h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
				<p className="max-w-md text-sm">{message}</p>
				{unauthorized ? (
					<Button asChild>
						<Link
							href={`/sign-in?redirect=${encodeURIComponent(`/pr?url=${urlParam}`)}`}
						>
							Sign in
						</Link>
					</Button>
				) : (
					<Button variant="outline" onClick={() => navigateTo("")}>
						Try another link
					</Button>
				)}
			</div>
		);
	}

	return (
		<div className="flex h-dvh flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
				{searchForm}
			</div>
			<main className="min-h-0 flex-1">
				{html ? (
					<iframe
						srcDoc={html}
						title={query.data?.title ?? "Pull request"}
						className="h-full w-full border-0"
						// No allow-scripts/allow-same-origin: the diff and description
						// are someone else's PR content, not ours. Tabs and collapsible
						// sections are pure CSS/native <details>, so they still work.
						// allow-popups(-to-escape-sandbox) only lets the target="_blank"
						// links open real, unsandboxed new tabs.
						sandbox="allow-popups allow-popups-to-escape-sandbox"
					/>
				) : null}
			</main>
		</div>
	);
}
