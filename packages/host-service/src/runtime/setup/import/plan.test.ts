import { describe, expect, it } from "bun:test";
import { buildCandidate, isStandaloneCommand, planScript } from "./plan";

describe("isStandaloneCommand", () => {
	it("accepts plain commands", () => {
		for (const line of [
			"bun install",
			'cp "$SUPERSET_ROOT_PATH/.env" .env',
			"docker compose up -d && sleep 2",
			"echo 'a # not a comment'",
			'echo "$(date +%s) (now)"',
			"ver=$(node -v)",
		]) {
			expect(isStandaloneCommand(line)).toBe(true);
		}
	});

	it("rejects lines that change meaning when joined with &&", () => {
		for (const line of [
			"if [ -f .env ]; then",
			"fi",
			"pnpm install \\",
			"bun dev &",
			"echo done;",
			"cat <<EOF",
			"bun install # deps",
			'echo "unterminated',
			"setup() {",
			"for f in a b; do echo $f; done",
			"value=$(false",
			"printf fallback)",
			"tag=`git describe",
		]) {
			expect(isStandaloneCommand(line)).toBe(false);
		}
	});

	it("rejects lines that would change or close the user's shell", () => {
		for (const line of [
			"set -euo pipefail",
			"shopt -s globstar",
			"trap cleanup EXIT",
			"exit 0",
			"return",
		]) {
			expect(isStandaloneCommand(line)).toBe(false);
		}
		expect(isStandaloneCommand("settle --all")).toBe(true);
	});
});

describe("planScript", () => {
	it("keeps simple multi-line scripts as config lines and drops comments", () => {
		expect(
			planScript("setup", ["# deps\npnpm install\n\npnpm build"], ["x.json"]),
		).toEqual({ commands: ["pnpm install", "pnpm build"] });
	});

	it("writes a bash script when a line cannot be split", () => {
		const plan = planScript(
			"setup",
			[
				"#!/bin/sh\nif [ ! -f .env ]; then\n  cp .env.example .env\nfi",
				"bun install",
			],
			["orca.yaml"],
		);
		expect(plan?.commands).toEqual([
			'bash "$SUPERSET_ROOT_PATH/.superset/setup.sh"',
		]);
		expect(plan?.scriptFile).toEqual({
			path: ".superset/setup.sh",
			content:
				"#!/usr/bin/env bash\n# Imported by Superset from orca.yaml.\nset -e\n\nif [ ! -f .env ]; then\n  cp .env.example .env\nfi\n\nbun install\n",
		});
	});

	it("keeps a command substitution that spans lines in the script file", () => {
		const plan = planScript(
			"setup",
			["value=$(false ||\nprintf fallback)\necho $value"],
			["conductor.json"],
		);
		expect(plan?.scriptFile?.content).toContain(
			"value=$(false ||\nprintf fallback)\necho $value",
		);
		expect(
			planScript("setup", ["value=$(false\nprintf fallback)"], ["x"])
				?.scriptFile,
		).toBeDefined();
	});

	it("returns null when nothing runnable remains", () => {
		expect(planScript("run", ["# only a comment\n\n"], ["t3.json"])).toBeNull();
	});
});

describe("buildCandidate", () => {
	it("rewrites variables and reports the ones with no equivalent", () => {
		const candidate = buildCandidate({
			source: "conductor",
			label: "Conductor",
			files: ["conductor.json"],
			scripts: {
				run: ["PORT=$CONDUCTOR_PORT bun dev --root $CONDUCTOR_ROOT_PATH"],
			},
			notImported: [],
		});
		expect(candidate?.scripts.run?.commands).toEqual([
			"PORT=$CONDUCTOR_PORT bun dev --root $SUPERSET_ROOT_PATH",
		]);
		expect(candidate?.notImported).toEqual([
			{
				file: "conductor.json",
				field: "$CONDUCTOR_PORT",
				reason: "unsupported-variable",
			},
		]);
	});

	it("returns null when the source has nothing to import", () => {
		expect(
			buildCandidate({
				source: "cmux",
				label: "cmux",
				files: ["cmux.json"],
				scripts: { setup: ["   "] },
				notImported: [],
			}),
		).toBeNull();
	});
});
