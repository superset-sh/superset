import { type ChildProcess, exec, spawn } from "node:child_process";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const execAsync = promisify(exec);
const MAX_FIX_ITERATIONS = 10;

interface GreptileScore {
	score: number | null;
	maxScore: number;
	summary: string | null;
	issues: string[];
	reviewContent: string | null;
	prNumber: number | null;
	prTitle: string | null;
	prUrl: string | null;
	reviewing: boolean;
	latestReviewId: number | null;
	owner: string | null;
	repo: string | null;
	error: string | null;
}

type FixPhase =
	| "idle"
	| "fixing"
	| "waiting-for-review"
	| "done"
	| "max-reached"
	| "stopped";

interface FixLoopEntry {
	process: ChildProcess | null;
	phase: FixPhase;
	iteration: number;
	lastTriggeredScore: number | null;
	reviewIdAtFixStart: number | null;
	exitCode: number | null;
	startedAt: number | null;
	logFile: string | null;
	pollTimer: ReturnType<typeof setInterval> | null;
	worktreePath: string;
}

// Track fix loop state per worktree — persists across workspace switches
const fixLoopState = new Map<string, FixLoopEntry>();

function getFixLoopStatus(worktreePath: string) {
	const entry = fixLoopState.get(worktreePath);
	if (!entry) {
		return {
			phase: "idle" as FixPhase,
			iteration: 0,
			lastTriggeredScore: null as number | null,
			startedAt: null as number | null,
			logFile: null as string | null,
			maxIterations: MAX_FIX_ITERATIONS,
		};
	}
	return {
		phase: entry.phase,
		iteration: entry.iteration,
		lastTriggeredScore: entry.lastTriggeredScore,
		startedAt: entry.startedAt,
		logFile: entry.logFile,
		maxIterations: MAX_FIX_ITERATIONS,
	};
}

function stopPollTimer(entry: FixLoopEntry) {
	if (entry.pollTimer) {
		clearInterval(entry.pollTimer);
		entry.pollTimer = null;
	}
}

function startReviewPolling(entry: FixLoopEntry) {
	stopPollTimer(entry);

	const poll = async () => {
		if (entry.phase !== "waiting-for-review") {
			stopPollTimer(entry);
			return;
		}

		try {
			const data = await getGreptileScore(entry.worktreePath);

			// Still reviewing — skip
			if (data.reviewing) return;

			// No new review yet
			if (
				data.latestReviewId === null ||
				data.latestReviewId === entry.reviewIdAtFixStart
			)
				return;

			// New review — check the score
			if (data.score === null || data.score === undefined) return;

			// Score is good — done!
			if (data.score >= 4) {
				entry.phase = "done";
				stopPollTimer(entry);
				return;
			}

			// Score still < 4 — trigger next iteration
			const nextIteration = entry.iteration + 1;
			if (nextIteration > MAX_FIX_ITERATIONS) {
				entry.phase = "max-reached";
				stopPollTimer(entry);
				return;
			}

			spawnFixProcess(
				entry,
				nextIteration,
				data.score,
				data.reviewContent,
				data.prNumber,
				data.owner,
				data.repo,
			);
		} catch {
			// will retry on next poll
		}
	};

	entry.pollTimer = setInterval(poll, 15_000);
	// Also poll once shortly after starting (give Greptile a moment)
	setTimeout(poll, 3_000);
}

function spawnFixProcess(
	entry: FixLoopEntry,
	iteration: number,
	score: number,
	reviewContent: string | null,
	prNumber: number | null,
	owner: string | null,
	repo: string | null,
) {
	// Kill any existing process
	if (entry.process) {
		try {
			entry.process.kill();
		} catch {
			// ignore
		}
	}
	stopPollTimer(entry);

	const ownerRepo = owner && repo ? `${owner}/${repo}` : "{owner}/{repo}";

	let prompt: string;
	if (reviewContent && prNumber) {
		prompt = `Fix Greptile code review issues on PR #${prNumber}. Iteration ${iteration}/${MAX_FIX_ITERATIONS}, current score: ${score}/5.

## Review Comments
${reviewContent}

## Steps
1. Read each file mentioned above at the specified line
2. Fix valid issues. Skip false positives — do not waste time on incorrect suggestions
3. Stage changed files, commit with message: "fix: address greptile review feedback"
4. Push to the current branch
5. Resolve addressed review threads on GitHub:
   - Get thread IDs: gh api graphql -f query='{ repository(owner: "${owner ?? "{owner}"}", name: "${repo ?? "{repo}"}") { pullRequest(number: ${prNumber}) { reviewThreads(first: 100) { nodes { id isResolved path comments(first: 1) { nodes { body } } } } } } }'
   - For each unresolved thread you fixed, resolve it: gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "THREAD_ID"}) { thread { isResolved } } }'

## If the comments above are incomplete
Fetch full review comments yourself:
  gh api repos/${ownerRepo}/pulls/${prNumber}/reviews --jq '[.[] | select(.user.login == "greptile-apps[bot]")] | last | .id'
  gh api repos/${ownerRepo}/pulls/${prNumber}/reviews/REVIEW_ID/comments --jq '.[] | {path, line, body}'`;
	} else if (prNumber) {
		prompt = `Check the latest Greptile review comments on PR #${prNumber} and fix all issues, then commit and push. Iteration ${iteration}/${MAX_FIX_ITERATIONS}, current score: ${score}/5.

Fetch review comments:
  gh api repos/${ownerRepo}/pulls/${prNumber}/reviews --jq '[.[] | select(.user.login == "greptile-apps[bot]")] | last | .id'
  gh api repos/${ownerRepo}/pulls/${prNumber}/reviews/REVIEW_ID/comments --jq '.[] | {path, line, body}'

Fix every issue, commit with message "fix: address greptile review feedback", and push.`;
	} else {
		prompt =
			"Check the latest Greptile review comments on the current PR and fix all issues, then commit and push.";
	}

	const logFile = join(tmpdir(), `greptile-fix-${Date.now()}.log`);
	const fd = openSync(logFile, "w");

	const child = spawn(
		"claude",
		["--dangerously-skip-permissions", "-p", prompt],
		{
			cwd: entry.worktreePath,
			detached: true,
			stdio: ["ignore", fd, fd],
		},
	);

	entry.process = child;
	entry.phase = "fixing";
	entry.iteration = iteration;
	entry.lastTriggeredScore = score;
	entry.exitCode = null;
	entry.startedAt = Date.now();
	entry.logFile = logFile;

	child.on("exit", async (code) => {
		if (entry.process !== child) return;
		entry.exitCode = code;

		// Capture current reviewId so we can detect when a NEW review lands
		try {
			const data = await getGreptileScore(entry.worktreePath);
			entry.reviewIdAtFixStart = data.latestReviewId;
		} catch {
			entry.reviewIdAtFixStart = null;
		}

		entry.phase = "waiting-for-review";
		startReviewPolling(entry);
	});

	child.on("error", () => {
		if (entry.process !== child) return;
		entry.exitCode = -1;
		entry.phase = "waiting-for-review";
		startReviewPolling(entry);
	});

	child.unref();
}

// Greptile check runs can get stuck at IN_PROGRESS permanently,
// so we don't rely on them. Instead we detect "reviewing" by:
// - No greptile_comment in PR body yet but a review exists, OR
// - The PR body has pending markers (reviewing/analyzing/in progress)
// The latestReviewId change is the reliable signal that a new review landed.

async function getGreptileScore(worktreePath: string): Promise<GreptileScore> {
	const empty: GreptileScore = {
		score: null,
		maxScore: 5,
		summary: null,
		issues: [],
		reviewContent: null,
		prNumber: null,
		prTitle: null,
		prUrl: null,
		reviewing: false,
		latestReviewId: null,
		owner: null,
		repo: null,
		error: null,
	};

	try {
		// Get current branch
		const git = simpleGit(worktreePath);
		const branch = (await git.branch()).current;
		if (!branch || branch === "main" || branch === "master") {
			return { ...empty, error: "No feature branch (on main)" };
		}

		// Find PR for this branch — get body (where Greptile embeds its review)
		let prJson: string;
		try {
			const { stdout } = await execAsync(
				"gh pr view --json number,title,url,body --jq '.' 2>/dev/null",
				{ cwd: worktreePath, timeout: 15_000 },
			);
			prJson = stdout.trim();
		} catch {
			return { ...empty, error: "No PR found for this branch" };
		}

		if (!prJson) {
			return { ...empty, error: "No PR found for this branch" };
		}

		const pr = JSON.parse(prJson) as {
			number: number;
			title: string;
			url: string;
			body: string;
		};

		// Extract owner/repo for GraphQL instructions in fix prompt
		let owner: string | null = null;
		let repo: string | null = null;
		try {
			const { stdout: repoJson } = await execAsync(
				"gh repo view --json owner,name --jq '{owner: .owner.login, name: .name}' 2>/dev/null",
				{ cwd: worktreePath, timeout: 15_000 },
			);
			const parsed = JSON.parse(repoJson.trim()) as {
				owner: string;
				name: string;
			};
			owner = parsed.owner;
			repo = parsed.name;
		} catch {
			// non-critical — prompt will use {owner}/{repo} placeholders
		}

		// Get latest review ID from greptile-apps[bot] (used to detect new reviews)
		let latestReviewId: number | null = null;
		let reviewContent: string | null = null;
		try {
			const { stdout: reviewsJson } = await execAsync(
				`gh api repos/{owner}/{repo}/pulls/${pr.number}/reviews --jq '[.[] | select(.user.login == "greptile-apps[bot]")] | last | .id' 2>/dev/null`,
				{ cwd: worktreePath, timeout: 15_000 },
			);
			const reviewIdStr = reviewsJson.trim();
			if (reviewIdStr && reviewIdStr !== "null") {
				latestReviewId = Number.parseInt(reviewIdStr, 10);
				// Get review comments with file/line context (not just body)
				const { stdout: commentsJson } = await execAsync(
					`gh api repos/{owner}/{repo}/pulls/${pr.number}/reviews/${latestReviewId}/comments --jq '[.[] | {path, line, body}]' 2>/dev/null`,
					{ cwd: worktreePath, timeout: 15_000 },
				);
				const comments = JSON.parse(commentsJson.trim() || "[]") as {
					path: string | null;
					line: number | null;
					body: string;
				}[];
				reviewContent = comments
					.map((c) => {
						const loc = c.path
							? `### ${c.path}${c.line ? ` (line ${c.line})` : ""}`
							: "### (general comment)";
						return `${loc}\n${c.body}`;
					})
					.join("\n\n")
					.slice(0, 15000);
			}
		} catch {
			// non-critical
		}

		// Extract the Greptile section from the PR body
		const greptileMatch = pr.body?.match(
			/<!-- greptile_comment -->([\s\S]*?)<!-- \/greptile_comment -->/,
		);

		if (!greptileMatch) {
			return {
				...empty,
				prNumber: pr.number,
				prTitle: pr.title,
				prUrl: pr.url,
				latestReviewId,
				reviewing: false,
				error: "No Greptile review on this PR yet",
			};
		}

		const greptileSection = greptileMatch[1];

		// Extract score
		const scoreMatch = greptileSection.match(
			/Confidence\s+Score:\s*(\d)\s*\/\s*5/i,
		);
		const score = scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null;

		// Extract summary
		let summary: string | null = null;
		const summaryMatch = greptileSection.match(
			/<h3>Greptile Summary<\/h3>\s*([\s\S]*?)(?=<h3>)/,
		);
		if (summaryMatch) {
			summary = summaryMatch[1]
				.replace(/<[^>]+>/g, "")
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.length > 0)
				.slice(0, 3)
				.join(" ")
				.slice(0, 300);
		}

		// Extract issues — bullet points between Confidence Score and Important Files
		const issuesMatch = greptileSection.match(
			/Confidence\s+Score:\s*\d\s*\/\s*5<\/h3>\s*([\s\S]*?)(?=<h3>Important\s+Files|<h3>Greptile\s+Summary|$)/i,
		);
		const issues: string[] = [];
		if (issuesMatch) {
			const raw = issuesMatch[1]
				.replace(/<[^>]+>/g, "")
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.length > 0);
			for (const line of raw) {
				if (issues.length < 10) {
					issues.push(line.slice(0, 500));
				}
			}
		}

		// Determine reviewing state from PR body content
		const reviewing =
			score === null &&
			(greptileSection.includes("reviewing") ||
				greptileSection.includes("in progress") ||
				greptileSection.includes("analyzing"));

		return {
			score,
			maxScore: 5,
			summary,
			issues,
			reviewContent,
			prNumber: pr.number,
			prTitle: pr.title,
			prUrl: pr.url,
			reviewing,
			latestReviewId,
			owner,
			repo,
			error: null,
		};
	} catch (error) {
		return {
			...empty,
			error: error instanceof Error ? error.message : "Failed to fetch",
		};
	}
}

export const createGreptileRouter = () => {
	return router({
		getGreptileScore: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(async ({ input }): Promise<GreptileScore> => {
				return getGreptileScore(input.worktreePath);
			}),

		getFixStatus: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(({ input }) => {
				return getFixLoopStatus(input.worktreePath);
			}),

		fixGreptile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					reviewContent: z.string().optional(),
					prNumber: z.number().optional(),
					owner: z.string().optional(),
					repo: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				let entry = fixLoopState.get(input.worktreePath);
				if (!entry) {
					entry = {
						process: null,
						phase: "idle",
						iteration: 0,
						lastTriggeredScore: null,
						reviewIdAtFixStart: null,
						exitCode: null,
						startedAt: null,
						logFile: null,
						pollTimer: null,
						worktreePath: input.worktreePath,
					};
					fixLoopState.set(input.worktreePath, entry);
				}

				spawnFixProcess(
					entry,
					1,
					0,
					input.reviewContent ?? null,
					input.prNumber ?? null,
					input.owner ?? null,
					input.repo ?? null,
				);
				return { started: true };
			}),

		stopFix: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(({ input }) => {
				const entry = fixLoopState.get(input.worktreePath);
				if (entry) {
					if (entry.process) {
						try {
							entry.process.kill();
						} catch {
							// ignore
						}
					}
					stopPollTimer(entry);
					entry.phase = "stopped";
				}
				return { stopped: true };
			}),
	});
};
