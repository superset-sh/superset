import { expect, test } from "bun:test";
import { resolve } from "node:path";

async function exercise(mode: string, overrides: Record<string, string> = {}) {
	const child = Bun.spawn(
		[
			process.execPath,
			resolve(import.meta.dir, "r2-fixture.integration.ts"),
			mode,
			JSON.stringify(overrides),
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
	if (code !== 0) throw new Error(err);
	return JSON.parse(out);
}

test("S3 writes keep private manifests and public avatars in separate buckets", async () => {
	const result = await exercise("s3");
	expect(result.paths).toEqual([
		"/private/pages/known/manifest.json",
		"/public/user/a/avatar/x/original",
	]);
});
test("S3 signs the external endpoint without moving server writes", async () => {
	const result = await exercise("s3");
	expect(new URL(result.put.url).origin).toBe("https://upload.example.test");
	expect(new URL(result.get).origin).toBe("https://upload.example.test");
	expect(new URL(result.put.url).pathname).toBe("/private/files/a/original");
	expect(
		new URL(result.put.url).searchParams.get("X-Amz-Credential"),
	).toContain("/garage/s3/");
	expect(result.put.headers).toEqual({ "Content-Type": "image/png" });
});
test("S3 deletion uses individual objects for Garage compatibility", async () => {
	const result = await exercise("s3");
	expect(result.deletes).toEqual([
		"/private/files/a/original",
		"/private/files/b/original",
	]);
});
test("generic S3 cleanup bounds parallel deletion without serializing every object", async () => {
	const result = await exercise("s3-concurrency");
	expect(result.maximum).toBe(4);
	expect(result.completed).toBe(9);
});
test("failed S3 deletion stops new claims and waits for already active requests", async () => {
	const result = await exercise("s3-concurrency-failure");
	expect(result).toEqual({
		maximum: 4,
		claimed: 4,
		completed: 3,
		error: "Owned deletion failure",
		settledWhileActive: false,
	});
});
test("S3 rejects same private and public buckets before a write", async () => {
	const result = await exercise("s3", { S3_PUBLIC_BUCKET: "private" });
	expect(result.error).toContain("different");
	expect(result.paths).toEqual([]);
});
test("S3 requires a configured public bucket rather than using the private one", async () => {
	const result = await exercise("s3", { S3_PUBLIC_BUCKET: "" });
	expect(result.error).toContain("S3_PUBLIC_BUCKET");
	expect(result.paths).toEqual([]);
});
test("cloud uses the existing R2 buckets and signing endpoint", async () => {
	const result = await exercise("cloud");
	expect(result.paths).toEqual([
		"/cloud-private/pages/known/manifest.json",
		"/cloud-public/user/a/avatar/x/original",
	]);
	expect(new URL(result.put.url).origin).toBe(result.endpoint);
	expect(
		new URL(result.put.url).searchParams.get("X-Amz-Credential"),
	).toContain("/auto/s3/");
});
