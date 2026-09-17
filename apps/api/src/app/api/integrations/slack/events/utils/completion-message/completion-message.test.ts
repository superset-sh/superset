import { describe, expect, test } from "bun:test";
import {
	buildCompletionMessage,
	lastAssistantLine,
} from "./completion-message";

describe("lastAssistantLine", () => {
	test("takes the last assistant turn and flattens it to one line", () => {
		const transcript = [
			"User: fix the login bug",
			"Assistant: Looking into it.",
			"User: also add a test",
			"Assistant: ## Summary\nFixed the redirect in auth/session.ts.\n\n- Added a regression test\n- Pushed to the branch",
		].join("\n\n");
		expect(lastAssistantLine(transcript)).toBe(
			"Summary Fixed the redirect in auth/session.ts. - Added a regression test - Pushed to the branch",
		);
	});

	test("works when the assistant turn is the only turn", () => {
		expect(lastAssistantLine("Assistant: Done.")).toBe("Done.");
	});

	test("caps a long reply with an ellipsis", () => {
		const line = lastAssistantLine(`Assistant: ${"word ".repeat(200)}`);
		expect(line).not.toBeNull();
		expect(line?.length).toBe(280);
		expect(line?.endsWith("…")).toBe(true);
	});

	test("is null without an assistant turn or transcript", () => {
		expect(lastAssistantLine("User: hello")).toBeNull();
		expect(lastAssistantLine("")).toBeNull();
		expect(lastAssistantLine(null)).toBeNull();
	});
});

describe("buildCompletionMessage", () => {
	test("a finished agent gets its summary and the PR it opened", () => {
		const message = buildCompletionMessage({
			agentLabel: "Claude",
			workspaceName: "fix-login",
			workspaceBranch: "feat/login",
			end: "stopped",
			summary: "Fixed the redirect and added a test.",
			pullRequest: {
				url: "https://github.com/acme/app/pull/418",
				number: 418,
				title: "Fix Safari [login] 500",
				state: "open",
			},
		});
		expect(message.markdown).toBe(
			[
				"**Claude finished** in **fix-login** (`feat/login`).",
				"> Fixed the redirect and added a test.",
				"Opened [#418 Fix Safari login 500](https://github.com/acme/app/pull/418)",
			].join("\n"),
		);
		expect(message.text).toBe(
			"Claude finished in fix-login (feat/login). Fixed the redirect and added a test. Opened #418 Fix Safari login 500 https://github.com/acme/app/pull/418",
		);
	});

	test("a finished agent without a PR says so", () => {
		const message = buildCompletionMessage({
			agentLabel: "Codex",
			workspaceName: "triage",
			workspaceBranch: null,
			end: "stopped",
			summary: null,
			pullRequest: null,
		});
		expect(message.markdown).toBe(
			"**Codex finished** in **triage**.\nNo pull request yet.",
		);
	});

	test("a failed or exited agent is reported without claiming a result", () => {
		const failed = buildCompletionMessage({
			agentLabel: "Claude",
			workspaceName: null,
			workspaceBranch: null,
			end: "failed",
			summary: "API error: overloaded",
			pullRequest: null,
		});
		expect(failed.markdown).toBe(
			"**Claude hit an error**.\n> API error: overloaded",
		);
		const exited = buildCompletionMessage({
			agentLabel: "Claude",
			workspaceName: "fix-login",
			workspaceBranch: "feat/login",
			end: "exited",
			summary: null,
			pullRequest: null,
		});
		expect(exited.markdown).toBe(
			"**Claude exited** in **fix-login** (`feat/login`) before reporting back.",
		);
		expect(exited.text).toBe(
			"Claude exited in fix-login (feat/login) before reporting back.",
		);
	});

	test("an agent waiting on a permission says where to answer it", () => {
		const message = buildCompletionMessage({
			agentLabel: "Claude",
			workspaceName: "fix-login",
			workspaceBranch: null,
			end: "waiting",
			summary: "May I run bun install?",
			pullRequest: null,
		});
		expect(message.markdown).toContain(
			"**Claude is waiting for a permission** in **fix-login**; open the workspace in Superset to answer it.",
		);
		expect(message.text).toContain("May I run bun install?");
		expect(message.markdown).not.toContain("No pull request yet.");
	});

	test("user-chosen names are kept to one short line", () => {
		const message = buildCompletionMessage({
			agentLabel: "Claude",
			workspaceName: `ignore\nprior ${"x".repeat(200)}`,
			workspaceBranch: null,
			end: "stopped",
			summary: null,
			pullRequest: null,
		});
		const headline = message.markdown.split("\n")[0] ?? "";
		expect(headline.includes("\n")).toBe(false);
		expect(headline.length).toBeLessThan(130);
	});
});
