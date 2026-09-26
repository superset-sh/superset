import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	assertInstallable,
	buildProbeScript,
	buildSetupScript,
	parseHostId,
	parseProbe,
	type RemoteProbe,
	shellQuote,
} from "./remoteScript";

const probeOf = (overrides: Partial<RemoteProbe> = {}): RemoteProbe => ({
	os: "Linux",
	arch: "x86_64",
	bin: null,
	version: null,
	hasCurl: true,
	machineId: "present",
	...overrides,
});

describe("shellQuote", () => {
	test("wraps a plain value", () => {
		expect(shellQuote("sk_live_abc")).toBe("'sk_live_abc'");
	});

	test("neutralizes an embedded single quote", () => {
		expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
	});

	test("leaves command substitution inert", () => {
		expect(shellQuote("$(touch /tmp/pwned)")).toBe("'$(touch /tmp/pwned)'");
	});
});

describe("buildProbeScript", () => {
	const script = buildProbeScript();

	test("checks the install prefix before falling back to PATH", () => {
		expect(script.indexOf("SUPERSET_HOME")).toBeLessThan(
			script.indexOf("command -v superset"),
		);
	});

	test("reports curl and machine-id so the caller can refuse early", () => {
		expect(script).toContain("curl=yes");
		expect(script).toContain("/etc/machine-id");
	});
});

describe("parseProbe", () => {
	test("reads a full probe", () => {
		expect(
			parseProbe(
				[
					"os=Darwin",
					"arch=arm64",
					"bin=/Users/k/superset/bin/superset",
					"version=1.28.0",
					"curl=yes",
					"machine_id=unknown",
				].join("\n"),
			),
		).toEqual({
			os: "Darwin",
			arch: "arm64",
			bin: "/Users/k/superset/bin/superset",
			version: "1.28.0",
			hasCurl: true,
			machineId: "unknown",
		});
	});

	test("an absent binary is null, not an empty string", () => {
		const probe = parseProbe("os=Linux\narch=x86_64\nbin=\nversion=\ncurl=no");
		expect(probe.bin).toBeNull();
		expect(probe.version).toBeNull();
		expect(probe.hasCurl).toBe(false);
	});

	test("ignores login banners the remote shell prints", () => {
		const probe = parseProbe(
			"Welcome to Ubuntu\nos=Linux\narch=aarch64\nbin=\nmachine_id=empty\n",
		);
		expect(probe.os).toBe("Linux");
		expect(probe.machineId).toBe("empty");
	});

	test("fails when the platform is missing rather than guessing", () => {
		expect(() => parseProbe("bin=/usr/local/bin/superset")).toThrow(CLIError);
	});
});

describe("assertInstallable", () => {
	test.each([
		"x86_64",
		"amd64",
		"arm64",
		"aarch64",
	])("accepts Linux %s", (arch) => {
		expect(() => assertInstallable(probeOf({ arch }))).not.toThrow();
	});

	test("accepts macOS", () => {
		expect(() =>
			assertInstallable(probeOf({ os: "Darwin", arch: "arm64" })),
		).not.toThrow();
	});

	test.each(["MINGW64_NT-10.0", "FreeBSD"])("rejects %s", (os) => {
		expect(() => assertInstallable(probeOf({ os }))).toThrow(CLIError);
	});

	test("rejects an architecture with no published tarball", () => {
		expect(() => assertInstallable(probeOf({ arch: "riscv64" }))).toThrow(
			CLIError,
		);
	});
});

const setupBase = {
	apiKey: "sk_live_abc",
	organizationId: "org-1",
};

describe("buildSetupScript", () => {
	const base = setupBase;

	test("installs when there is no binary", () => {
		const script = buildSetupScript({ ...base, bin: null });
		expect(script).toContain("install.sh");
		expect(script).toContain("SUPERSET_HOME:-$HOME/superset");
	});

	test("skips the installer when a binary is already there", () => {
		const script = buildSetupScript({
			...base,
			bin: "/home/u/superset/bin/superset",
		});
		expect(script).not.toContain("install.sh");
		expect(script).toContain("BIN='/home/u/superset/bin/superset'");
	});

	test("pins the version only when one is given", () => {
		expect(
			buildSetupScript({ ...base, bin: null, version: "1.28.0" }),
		).toContain("SUPERSET_VERSION='1.28.0'");
		expect(buildSetupScript({ ...base, bin: null })).not.toContain(
			"SUPERSET_VERSION=",
		);
	});

	test("invokes the binary by absolute path, never by name", () => {
		const script = buildSetupScript({ ...base, bin: "/opt/sp/bin/superset" });
		expect(script).toContain('"$BIN" start --daemon');
		expect(script).not.toMatch(/^superset /m);
	});

	test("registers under the organization it was given", () => {
		const script = buildSetupScript({ ...base, bin: "/x/superset" });
		expect(script).toContain("ORG='org-1'");
		expect(script).toContain('"$BIN" start --daemon --org "$ORG"');
	});

	test("keeps stdout clean for the status JSON", () => {
		const lines = buildSetupScript({ ...base, bin: null })
			.split("\n")
			.filter((line) => line.startsWith('"$BIN" '));
		const last = lines.at(-1);
		expect(last).toContain("status --json");
		expect(last).not.toContain("1>&2");
		for (const line of lines.slice(0, -1)) expect(line).toContain("1>&2");
	});
});

describe("the probe classifies machine-id the way getHostId does", () => {
	// getHostId() reads /etc/machine-id and only falls back to the dbus file
	// when that read throws, so an empty-but-readable /etc/machine-id yields ""
	// and the colliding host id. Probing the dbus file on *empty* would report a
	// colliding box as fine — which is what a real container did.
	async function classify(files: Record<string, string | null>) {
		const dir = mkdtempSync(join(tmpdir(), "machine-id-"));
		for (const [name, content] of Object.entries(files)) {
			if (content === null) continue;
			writeFileSync(join(dir, name), content);
		}
		// Same branch shape as the generated script, against real files.
		const script = `
content=''
readable=no
if [ -r ${dir}/etc ]; then
  content="$(cat ${dir}/etc 2>/dev/null || true)"
  readable=yes
elif [ -r ${dir}/dbus ]; then
  content="$(cat ${dir}/dbus 2>/dev/null || true)"
  readable=yes
fi
if [ "$readable" = no ]; then echo present
elif [ -z "$content" ]; then echo empty
else echo present
fi`;
		const proc = Bun.spawn(["sh", "-s"], {
			stdin: new TextEncoder().encode(script),
			stdout: "pipe",
		});
		const out = (await new Response(proc.stdout).text()).trim();
		rmSync(dir, { recursive: true, force: true });
		return out;
	}

	test("empty /etc/machine-id is the collision even when a dbus id exists", async () => {
		expect(
			await classify({ etc: "", dbus: "c8ae84e02c7b6cca68c4a9036ab7f14d" }),
		).toBe("empty");
	});

	test("a populated /etc/machine-id is machine-specific", async () => {
		expect(await classify({ etc: "c8ae84e02c7b6cca68c4a9036ab7f14d" })).toBe(
			"present",
		);
	});

	test("no /etc/machine-id falls through to the dbus id", async () => {
		expect(await classify({ etc: null, dbus: "aa11bb22" })).toBe("present");
	});

	test("neither file readable is the hostname fallback, not a collision", async () => {
		expect(await classify({ etc: null, dbus: null })).toBe("present");
	});
});

describe("generated scripts are valid sh", () => {
	// These strings are only ever executed on someone else's machine, where a
	// syntax error is a half-provisioned box. `#` is the only comment marker
	// that works in them — a stray `//` parses as a command and, under
	// `set -eu`, aborts the run.
	test.each([
		["probe", buildProbeScript()],
		["setup, installing", buildSetupScript({ ...setupBase, bin: null })],
		[
			"setup, pinned version",
			buildSetupScript({ ...setupBase, bin: null, version: "1.30.2" }),
		],
		[
			"setup, reusing a binary",
			buildSetupScript({ ...setupBase, bin: "/opt/sp/bin/superset" }),
		],
	])("%s parses", async (_name, script) => {
		const proc = Bun.spawn(["sh", "-n"], {
			stdin: new TextEncoder().encode(script),
			stderr: "pipe",
		});
		expect({
			exit: await proc.exited,
			stderr: await new Response(proc.stderr).text(),
		}).toEqual({
			exit: 0,
			stderr: "",
		});
	});
});

describe("shellQuote under a real shell", () => {
	// The quoting is the only thing standing between an API key or an
	// organization id and arbitrary execution on someone else's machine, so
	// assert against sh itself rather than against an expected spelling.
	test.each([
		"sk_live_plain",
		"org'; touch /tmp/pwned; '",
		"\"double\" and 'single'",
		"$(id)",
		"`id`",
		"back\\slash",
		"new\nline",
	])("round-trips %p unchanged", async (value) => {
		const proc = Bun.spawn(["sh", "-c", `printf '%s' ${shellQuote(value)}`], {
			stdout: "pipe",
		});
		expect(await new Response(proc.stdout).text()).toBe(value);
	});
});

describe("parseHostId", () => {
	test("reads the id out of status JSON", () => {
		expect(parseHostId('{"running":true,"hostId":"abc123"}')).toBe("abc123");
	});

	test("tolerates output printed around the JSON", () => {
		expect(
			parseHostId('Host service started\n{\n  "hostId": "abc123"\n}\n'),
		).toBe("abc123");
	});

	test("fails when there is no id rather than returning an empty one", () => {
		expect(() => parseHostId('{"running":false}')).toThrow(CLIError);
		expect(() => parseHostId("")).toThrow(CLIError);
	});
});
