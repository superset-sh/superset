import { expect, test } from "bun:test";
import { resolve } from "node:path";

async function exercise(mode: string) {
	const child = Bun.spawn(
		[
			process.execPath,
			resolve(import.meta.dir, "upload-fixture.integration.ts"),
			mode,
		],
		{
			cwd: "/tmp",
			env: { PATH: process.env.PATH, SKIP_ENV_VALIDATION: "1" },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [out, err, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code) throw new Error(err);
	return JSON.parse(out);
}
test("Garage avatar returns the direct public original URL", async () => {
	const r = await exercise("direct");
	expect(r.url).toBe("https://public.example.test/user/a/avatar/new/original");
	expect(r.writes[0].bucket).toBe("public");
});
test("cloud avatar retains Cloudflare transformation URLs", async () => {
	const r = await exercise("cloud");
	expect(r.url).toBe(
		"https://static.example.test/cdn-cgi/image/width=256,height=256,fit=crop,format=auto/user/a/avatar/new/original",
	);
});
test("missing public origin fails before storage insertion", async () => {
	const r = await exercise("missing");
	expect(r.error).toContain("public");
	expect(r.writes).toEqual([]);
});
test("failed row update rolls back the fresh object and retains the old one", async () => {
	const r = await exercise("rollback");
	expect(r.error).toBe("row failed");
	expect(r.deleted).toEqual([["user/a/avatar/new/original"]]);
});
test("successful row update precedes reclaim of existing direct images", async () => {
	const r = await exercise("replace");
	expect(r.order).toEqual(["write", "save", "delete"]);
	expect(r.deleted[0]).toEqual([
		"user/a/avatar/old/original",
		"user/a/avatar/old/256.webp",
		"user/a/avatar/old/64.webp",
	]);
});
test("reclaim refuses another owner even on the public origin", async () => {
	const r = await exercise("other-owner");
	expect(r.error).toBeUndefined();
	expect(r.deleted).toEqual([]);
});

test("cloud replacement reclaims the old transformed image after saving", async () => {
	const result = await exercise("cloud-replace");
	expect(result.error).toBeUndefined();
	expect(result.order).toEqual(["write", "save", "delete"]);
	expect(result.deleted[0]).toEqual([
		"user/a/avatar/old/original",
		"user/a/avatar/old/256.webp",
		"user/a/avatar/old/64.webp",
	]);
});

test("S3 repointing preserves the original key without a Cloudflare transform path", async () => {
	const result = await exercise("repoint");
	expect(result.url).toBe(
		"https://public.example.test/user/a/avatar/old/64.webp",
	);
});
test("replacement waits for old-object reclamation before returning the saved result", async () => {
	const result = await exercise("cleanup-wait");
	expect(result.returnedBeforeCleanup).toBe(false);
	expect(result.result).toBe("saved");
});

test("failed old-object reclamation preserves the saved replacement", async () => {
	const result = await exercise("cleanup-fail");
	expect(result.error).toBeUndefined();
	expect(result.url).toBe(
		"https://public.example.test/user/a/avatar/new/original",
	);
	expect(result.order).toEqual(["write", "save", "delete"]);
});
