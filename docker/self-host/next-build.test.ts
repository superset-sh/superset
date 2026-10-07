import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

const owned: string[] = [];
afterEach(() => {
	for (const path of owned.splice(0))
		rmSync(path, { recursive: true, force: true });
});
const fixture = (
	app = "web",
	failure = false,
	entry = true,
	publicAssets = true,
) => {
	const root = mkdtempSync("/tmp/next-image-build-");
	owned.push(root);
	const workspace = join(root, "workspace"),
		release = join(root, "release"),
		bin = join(root, "bin"),
		log = join(root, "calls.json");
	mkdirSync(bin, { recursive: true });
	const standalone = join(
		workspace,
		`apps/${app}/.next/standalone/apps/${app}`,
	);
	mkdirSync(standalone, { recursive: true });
	if (entry) writeFileSync(join(standalone, "server.js"), "owned server");
	const statics = join(workspace, `apps/${app}/.next/static`);
	mkdirSync(statics, { recursive: true });
	writeFileSync(join(statics, "asset.js"), "owned static");
	if (publicAssets) {
		const assets = join(workspace, `apps/${app}/public`);
		mkdirSync(assets, { recursive: true });
		writeFileSync(join(assets, "logo.svg"), "owned public");
	}
	writeFileSync(join(workspace, ".env"), "DO_NOT_COPY=fake-owned-fixture\n");
	const bun = `#!${process.execPath}
const fs=require('node:fs');fs.writeFileSync(process.env.FIXTURE_LOG,JSON.stringify({argv:process.argv.slice(2), env:process.env}));process.exit(Number(process.env.FIXTURE_FAIL));
`;
	writeFileSync(join(bin, "bun"), bun, { mode: 0o700 });
	const env = {
		PATH: `${bin}:/usr/bin:/bin`,
		TMPDIR: root,
		FIXTURE_LOG: log,
		FIXTURE_FAIL: failure ? "1" : "0",
		NEXT_PUBLIC_API_URL: "https://api.fixture.invalid",
		NEXT_PUBLIC_WEB_URL: "https://web.fixture.invalid",
		NEXT_PUBLIC_ADMIN_URL: "https://admin.fixture.invalid",
		NEXT_PUBLIC_MARKETING_URL: "https://marketing.fixture.invalid",
		NEXT_PUBLIC_DOCS_URL: "https://docs.fixture.invalid",
		NEXT_PUBLIC_RELAY_URL: "wss://relay.fixture.invalid",
		NEXT_PUBLIC_REALTIME_URL: "wss://realtime.fixture.invalid",
		RELAY_URL: "https://relay.fixture.invalid",
		RELAY_BACKUP_URL: "https://relay-backup.fixture.invalid",
		REALTIME_URL: "https://realtime.fixture.invalid",
		USERCONTENT_URL: "https://frame.fixture.invalid",
	};
	const run = (
		selected = app,
		values: Record<string, string | undefined> = {},
	) =>
		spawnSync(
			"/bin/sh",
			[join(import.meta.dir, "next-build.sh"), selected, workspace, release],
			{
				cwd: root,
				env: { ...env, ...values },
				encoding: "utf8",
				timeout: 10000,
			},
		);
	return { root, workspace, release, log, run };
};
test("rejects unknown app before any command or staging", () => {
	const f = fixture();
	const r = f.run("desktop");
	expect(r.status).not.toBe(0);
	expect(existsSync(f.log)).toBe(false);
	expect(existsSync(f.release)).toBe(false);
});
test("requires explicit baked origins before building", () => {
	const f = fixture();
	const r = f.run("web", { NEXT_PUBLIC_WEB_URL: undefined });
	expect(r.status).not.toBe(0);
	expect(existsSync(f.log)).toBe(false);
	expect(existsSync(f.release)).toBe(false);
});
test("stages actual monorepo standalone, static and public assets", () => {
	const f = fixture();
	const r = f.run();
	expect(r.status).toBe(0);
	expect(readFileSync(join(f.release, "apps/web/server.js"), "utf8")).toBe(
		"owned server",
	);
	expect(
		readFileSync(join(f.release, "apps/web/.next/static/asset.js"), "utf8"),
	).toBe("owned static");
	expect(
		readFileSync(join(f.release, "apps/web/public/logo.svg"), "utf8"),
	).toBe("owned public");
	expect(existsSync(join(f.release, ".env"))).toBe(false);
	const call = JSON.parse(readFileSync(f.log, "utf8"));
	expect(call.argv).toEqual([
		"x",
		"--no-install",
		"turbo",
		"run",
		"build",
		"--filter=@superset/web",
		"--env-mode=loose",
	]);
	expect(call.env.NEXT_OUTPUT_STANDALONE).toBe("1");
	expect(call.env.SKIP_ENV_VALIDATION).toBe("1");
	expect(call.env.NEXT_PUBLIC_API_URL).toBe("https://api.fixture.invalid");
	expect(call.env.SELF_HOST_QUEUE_SECRET.length).toBeGreaterThanOrEqual(32);
});
test("API has no public directory requirement", () => {
	const f = fixture("api", false, true, false);
	expect(f.run().status).toBe(0);
	expect(readFileSync(join(f.release, "apps/api/server.js"), "utf8")).toBe(
		"owned server",
	);
	expect(existsSync(join(f.release, "apps/api/public"))).toBe(false);
});
test("docs builds through its own graph without database build placeholders", () => {
	const f = fixture("docs");
	expect(f.run().status).toBe(0);
	const call = JSON.parse(readFileSync(f.log, "utf8"));
	expect(call.argv).toContain("--filter=@superset/docs");
	expect(call.env.DATABASE_URL).toBeUndefined();
	expect(
		readFileSync(join(f.release, "apps/docs/public/logo.svg"), "utf8"),
	).toBe("owned public");
});
test("failed build never publishes partial staging", () => {
	const f = fixture("web", true);
	const r = f.run();
	expect(r.status).not.toBe(0);
	expect(existsSync(f.log)).toBe(true);
	expect(existsSync(f.release)).toBe(false);
});
test("missing generated server refuses apparent successful build", () => {
	const f = fixture("web", false, false);
	const r = f.run();
	expect(r.status).not.toBe(0);
	expect(existsSync(f.log)).toBe(true);
	expect(existsSync(f.release)).toBe(false);
});

test("an existing release is refused without overwriting or running the graph", () => {
	const f = fixture();
	mkdirSync(f.release);
	writeFileSync(join(f.release, "owned-existing"), "preserved");
	expect(f.run().status).not.toBe(0);
	expect(readFileSync(join(f.release, "owned-existing"), "utf8")).toBe(
		"preserved",
	);
	expect(existsSync(f.log)).toBe(false);
});

test("missing browser static assets fail before release staging", () => {
	const f = fixture();
	rmSync(join(f.workspace, "apps/web/.next/static"), { recursive: true });
	expect(f.run().status).not.toBe(0);
	expect(existsSync(f.log)).toBe(true);
	expect(existsSync(f.release)).toBe(false);
});
