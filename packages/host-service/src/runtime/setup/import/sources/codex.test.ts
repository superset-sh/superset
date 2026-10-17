import { describe, expect, it } from "bun:test";
import { buildCandidate } from "../plan";
import { parseCodex } from "./codex";
import { readerFor } from "./test-utils";

const environment = (toml: string) =>
	readerFor({ ".codex/environments/environment.toml": toml });

describe("parseCodex", () => {
	it("maps setup, cleanup, and the first action", () => {
		const parsed = parseCodex(
			environment(`version = 1
name = "web"

[setup]
script = '''
pnpm install
pnpm build
'''

[cleanup]
script = "docker compose down" # stop services

[actions.dev]
name = "Dev"
command = "pnpm dev"

[actions.test]
command = "pnpm test"
`),
		);
		const candidate = buildCandidate(parsed);
		expect(candidate?.scripts).toEqual({
			setup: { commands: ["pnpm install", "pnpm build"] },
			teardown: { commands: ["docker compose down"] },
			run: { commands: ["pnpm dev"] },
		});
		expect(candidate?.notImported).toEqual([
			{
				file: ".codex/environments/environment.toml",
				field: "actions.test",
				reason: "extra-command",
			},
		]);
	});

	it("decodes basic-string escapes and line-ending backslashes", () => {
		const parsed = parseCodex(
			environment(
				'[setup]\nscript = """\necho "a\\tb" \\\n  && bun install\nprintf \'%s\\n\' x"""\n',
			),
		);
		expect(parsed?.scripts.setup).toEqual([
			"echo \"a\tb\" && bun install\nprintf '%s\n' x",
		]);
	});

	it("reads [[actions]] arrays and reports unknown settings", () => {
		const parsed = parseCodex(
			environment(
				'[[actions]]\nname = "Run"\ncommand = "bun dev"\n\n[[actions]]\ncommand = "bun test"\n\n[setup]\nscript = "bun i"\nenv = { A = "1" }\n',
			),
		);
		expect(parsed?.scripts.run).toEqual(["bun dev"]);
		expect(parsed?.notImported.map((entry) => entry.field)).toEqual([
			"actions[1]",
			"setup.env",
		]);
	});

	it("reads quoted table and key names", () => {
		const parsed = parseCodex(
			environment(
				'["setup"]\n"script" = "bun install"\n[\'actions\'."dev"]\ncommand = "bun dev"\n',
			),
		);
		expect(parsed?.scripts.setup).toEqual(["bun install"]);
		expect(parsed?.scripts.run).toEqual(["bun dev"]);
	});

	it("rejects an out-of-range unicode escape instead of throwing", () => {
		expect(
			parseCodex(environment('[setup]\nscript = "echo \\U00110000"\n')),
		).toBeNull();
		expect(
			parseCodex(environment('[setup]\nscript = "echo \\uD800"\n')),
		).toBeNull();
	});

	it("rejects an unterminated string", () => {
		expect(
			parseCodex(environment('[setup]\nscript = """\nbun i\n')),
		).toBeNull();
	});
});
