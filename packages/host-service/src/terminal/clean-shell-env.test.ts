import { describe, expect, test } from "bun:test";
import { parseEnvOutput } from "./clean-shell-env.ts";

const DELIMITER = "__SUPERSET_SHELL_ENV__";

function withDelimiters(body: string): string {
	return `${DELIMITER}\n${body}\n${DELIMITER}`;
}

describe("parseEnvOutput", () => {
	test("parses standard KEY=value lines", () => {
		const result = parseEnvOutput(
			withDelimiters("HOME=/Users/test\nPATH=/usr/bin\nSHELL=/bin/zsh"),
		);
		expect(result).toEqual({
			HOME: "/Users/test",
			PATH: "/usr/bin",
			SHELL: "/bin/zsh",
		});
	});

	test("drops exported bash function definitions (BASH_FUNC_*)", () => {
		const body = [
			"HOME=/home/ec2-user",
			"BASH_FUNC_which%%=() {  (alias; eval declare -f) | /usr/bin/which --tty-only --read-alias --read-functions --show-tilde --show-dot $@",
			"}",
			"PATH=/usr/local/bin:/usr/bin",
		].join("\n");
		const result = parseEnvOutput(withDelimiters(body));
		expect(result).toEqual({
			HOME: "/home/ec2-user",
			PATH: "/usr/local/bin:/usr/bin",
		});
		expect(Object.keys(result)).not.toContain("BASH_FUNC_which%%");
	});

	test("ignores continuation lines that contain '='", () => {
		const body = [
			"HOME=/home/x",
			"BASH_FUNC_foo%%=() {  local x=1",
			"  local y=2",
			"}",
			"USER=x",
		].join("\n");
		const result = parseEnvOutput(withDelimiters(body));
		expect(result).toEqual({ HOME: "/home/x", USER: "x" });
	});

	test("throws when delimiter is missing", () => {
		expect(() => parseEnvOutput("HOME=/x")).toThrow("delimiter not found");
	});

	test("throws when section parses to empty", () => {
		expect(() => parseEnvOutput(withDelimiters(""))).toThrow("returned empty");
	});
});
