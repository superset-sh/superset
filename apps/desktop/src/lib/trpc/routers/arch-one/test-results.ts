import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const execAsync = promisify(exec);

interface TestResult {
	total: number;
	passed: number;
	failed: number;
	skipped: number;
	duration: number | null;
	lastRun: string | null;
	failedTests: string[];
}

export const createTestResultsRouter = () => {
	return router({
		getTestResults: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(async ({ input }): Promise<TestResult> => {
				// Try to read cached test results from common output locations
				const possiblePaths = [
					join(input.worktreePath, "test-results.json"),
					join(input.worktreePath, ".test-results.json"),
					join(input.worktreePath, "coverage", "test-results.json"),
				];

				for (const resultPath of possiblePaths) {
					try {
						if (!existsSync(resultPath)) continue;
						const content = readFileSync(resultPath, "utf-8");
						const data = JSON.parse(content);
						return {
							total: data.numTotalTests ?? data.total ?? 0,
							passed: data.numPassedTests ?? data.passed ?? 0,
							failed: data.numFailedTests ?? data.failed ?? 0,
							skipped: data.numPendingTests ?? data.skipped ?? 0,
							duration: data.duration ?? null,
							lastRun: data.startTime ?? data.lastRun ?? null,
							failedTests: (data.failedTests ?? []).slice(0, 10),
						};
					} catch {
						continue;
					}
				}

				return {
					total: 0,
					passed: 0,
					failed: 0,
					skipped: 0,
					duration: null,
					lastRun: null,
					failedTests: [],
				};
			}),
	});
};
