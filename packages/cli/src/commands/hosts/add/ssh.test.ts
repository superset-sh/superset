import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import {
	buildSshArgs,
	describeSshTarget,
	parseSshTarget,
	stderrHint,
} from "./ssh";

describe("parseSshTarget", () => {
	test("bare hostname", () => {
		expect(parseSshTarget("devbox")).toEqual({
			user: undefined,
			host: "devbox",
		});
	});

	test("user@host", () => {
		expect(parseSshTarget("ubuntu@10.0.0.5")).toEqual({
			user: "ubuntu",
			host: "10.0.0.5",
		});
	});

	test("user@host:port", () => {
		expect(parseSshTarget("ubuntu@devbox:2222")).toEqual({
			user: "ubuntu",
			host: "devbox",
			port: 2222,
		});
	});

	test("bracketed IPv6 with a port", () => {
		expect(parseSshTarget("root@[2001:db8::1]:22")).toEqual({
			user: "root",
			host: "2001:db8::1",
			port: 22,
		});
	});

	test("bare IPv6 keeps its colons instead of reading one as a port", () => {
		expect(parseSshTarget("2001:db8::1")).toEqual({
			user: undefined,
			host: "2001:db8::1",
		});
	});

	test("a user containing @ splits at the last one", () => {
		expect(parseSshTarget("user@example.com@devbox")).toEqual({
			user: "user@example.com",
			host: "devbox",
		});
	});

	test("rejects a target ssh would read as a flag", () => {
		expect(() => parseSshTarget("-oProxyCommand=touch /tmp/pwned")).toThrow(
			CLIError,
		);
	});

	test.each([
		["", "empty"],
		["   ", "whitespace only"],
		["@devbox", "no user before @"],
		["ubuntu@", "no hostname"],
		["devbox:0", "port below range"],
		["devbox:65536", "port above range"],
		["devbox:http", "non-numeric port"],
		["devbox:", "empty port"],
		["dev box", "whitespace inside"],
	])("rejects %p (%s)", (raw) => {
		expect(() => parseSshTarget(raw)).toThrow(CLIError);
	});
});

describe("describeSshTarget", () => {
	test("includes the port when there is one", () => {
		expect(describeSshTarget(parseSshTarget("ubuntu@devbox:2222"))).toBe(
			"ubuntu@devbox:2222",
		);
	});

	test("omits the port when there is none", () => {
		expect(describeSshTarget(parseSshTarget("devbox"))).toBe("devbox");
	});
});

describe("buildSshArgs", () => {
	test("reads the script from stdin rather than passing it as an argument", () => {
		const args = buildSshArgs(parseSshTarget("devbox"), { batch: false });
		expect(args.at(-1)).toBe("sh -s");
		expect(args.at(-2)).toBe("devbox");
	});

	test("adds BatchMode only when batching", () => {
		expect(buildSshArgs(parseSshTarget("devbox"), { batch: true })).toContain(
			"BatchMode=yes",
		);
		expect(
			buildSshArgs(parseSshTarget("devbox"), { batch: false }),
		).not.toContain("BatchMode=yes");
	});

	test("carries the port from the target", () => {
		const args = buildSshArgs(parseSshTarget("devbox:2222"), { batch: true });
		expect(args).toContain("-p");
		expect(args[args.indexOf("-p") + 1]).toBe("2222");
	});

	test("an explicit port overrides the one in the target", () => {
		const args = buildSshArgs(parseSshTarget("devbox:2222"), {
			batch: true,
			port: 2200,
		});
		expect(args[args.indexOf("-p") + 1]).toBe("2200");
	});

	test("passes an identity file through", () => {
		const args = buildSshArgs(parseSshTarget("devbox"), {
			batch: true,
			identity: "~/.ssh/id_devbox",
		});
		expect(args[args.indexOf("-i") + 1]).toBe("~/.ssh/id_devbox");
	});
});

describe("stderrHint", () => {
	test("keeps only the last lines", () => {
		expect(stderrHint("a\nb\nc\nd\ne\nf", 2)).toBe("e\nf");
	});

	test("is undefined when there is nothing to report", () => {
		expect(stderrHint("   \n  ")).toBeUndefined();
	});
});
