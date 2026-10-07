import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

function initialize(retainedSecret: string) {
	const jq = Bun.which("jq");
	if (!jq) throw Error("Garage initialization fixture requires jq");
	const root = mkdtempSync("/tmp/superset-garage-init-");
	try {
		const bin = join(root, "bin"),
			log = join(root, "commands");
		mkdirSync(bin);
		writeFileSync(
			join(bin, "garage"),
			'#!/bin/sh\nprintf "%s\\n" "$*" >> "$FIXTURE_LOG"\n',
			{ mode: 0o700 },
		);
		writeFileSync(
			join(bin, "aws"),
			'#!/bin/sh\nprintf "aws\\n" >> "$FIXTURE_LOG"\n',
			{ mode: 0o700 },
		);
		writeFileSync(
			join(bin, "curl"),
			`#!/bin/sh
case "$*" in
 *GetClusterStatus*) printf '%s' '{"nodes":[{"id":"node"}],"layoutVersion":1}' ;;
 *GetKeyInfo*) printf '{"accessKeyId":"fixture-key","secretAccessKey":"%s"}' "$RETAINED_SECRET" ;;
 *GetBucketInfo*) case "$*" in *private*) printf '{"id":"private-id"}' ;; *) printf '{"id":"public-id"}' ;; esac ;;
esac
`,
			{ mode: 0o700 },
		);
		const result = spawnSync(
			"/bin/sh",
			[join(import.meta.dir, "garage-init.sh")],
			{
				encoding: "utf8",
				env: {
					PATH: `${bin}:${dirname(jq)}:/usr/bin:/bin`,
					TMPDIR: root,
					FIXTURE_LOG: log,
					RETAINED_SECRET: retainedSecret,
					GARAGE_ADMIN_TOKEN: "fixture-admin",
					GARAGE_RPC_SECRET: "fixture-rpc",
					S3_ACCESS_KEY: "fixture-key",
					S3_SECRET_KEY: "configured-secret",
					S3_BUCKET: "private",
					S3_PUBLIC_BUCKET: "public",
					STORAGE_CORS_ORIGINS: '["https://app.example.test"]',
				},
			},
		);
		return {
			status: result.status,
			output: result.stdout + result.stderr,
			commands: readFileSync(log, "utf8"),
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}
test("retained Garage credentials must match before changing bucket permissions or website policy", () => {
	const result = initialize("different-secret");
	expect(result.status).not.toBe(0);
	expect(result.output).toContain("retained");
	expect(result.output).not.toContain("different-secret");
	expect(result.output).not.toContain("configured-secret");
	expect(result.commands).not.toContain("bucket allow");
	expect(result.commands).not.toContain("website");
	expect(result.commands).not.toContain("aws");
});
test("matching retained Garage credentials reconcile the existing separate bucket policies", () => {
	const result = initialize("configured-secret");
	expect(result.status).toBe(0);
	expect(result.commands).toContain("bucket website --deny private");
	expect(result.commands).toContain("bucket website --allow public");
});
