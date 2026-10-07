import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = new URL("../../../", import.meta.url);
const fakeEnv: Record<string, string> = {};
for (const line of readFileSync(
	new URL(".env.local.example", root),
	"utf8",
).split("\n")) {
	const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
	if (match?.[1] && match[2])
		fakeEnv[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
}
const schemas = [
	"packages/auth",
	"packages/trpc",
	"apps/api",
	"apps/web",
	"apps/admin",
	"apps/marketing",
];
async function validateSchema(
	schema: string,
	mode: "native" | "default" | "empty" | "cloud-missing",
	redisUrl?: string,
	billingConfigured?: boolean,
) {
	const runtimeEnv: Record<string, string> = {
		...fakeEnv,
		PATH: process.env.PATH ?? "",
	};
	delete runtimeEnv.SKIP_ENV_VALIDATION;
	delete runtimeEnv.REDIS_URL;
	delete runtimeEnv.SELF_HOST_KV;
	if (billingConfigured !== undefined) {
		for (const key of Object.keys(runtimeEnv))
			if (key.startsWith("STRIPE_")) delete runtimeEnv[key];
		if (billingConfigured)
			runtimeEnv.STRIPE_SECRET_KEY = "sk_disposable_configured";
	}
	if (redisUrl) runtimeEnv.REDIS_URL = redisUrl;
	if (mode === "native") runtimeEnv.SELF_HOST_KV = "1";
	if (mode === "empty") {
		runtimeEnv.SELF_HOST_KV = "";
		runtimeEnv.REDIS_URL = "";
	}
	if (mode === "native" || mode === "cloud-missing") {
		delete runtimeEnv.KV_REST_API_URL;
		delete runtimeEnv.KV_REST_API_TOKEN;
	}
	const envPath = new URL(`${schema}/src/env.ts`, root).pathname;
	const child = Bun.spawn(
		[
			process.execPath,
			"--no-env-file",
			"-e",
			`
		import { mock } from "bun:test";
		mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
		const { env } = await import(${JSON.stringify(envPath)});
		if (${schema === "packages/auth" && !!redisUrl}) { const { createKv } = await import(${JSON.stringify(new URL("packages/shared/src/kv.ts", root).pathname)}); createKv(); }
		if ((env.SELF_HOST_KV === "1") !== ${mode === "native"} || (env.REDIS_URL || "redis://127.0.0.1:6379") !== ${JSON.stringify(redisUrl || "redis://127.0.0.1:6379")}) throw Error("KV defaults changed");
	`,
		],
		{ cwd: tmpdir(), env: runtimeEnv, stdout: "pipe", stderr: "pipe" },
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, exitCode };
}
for (const schema of schemas) {
	if (schema !== "packages/trpc") {
		test(`${schema} starts without disabled billing credentials`, async () => {
			expect(await validateSchema(schema, "native", undefined, false)).toEqual({
				stdout: "",
				stderr: "",
				exitCode: 0,
			});
		});
		if (schema !== "packages/auth")
			test(`${schema} still requires complete configured billing`, async () => {
				const result = await validateSchema(schema, "native", undefined, true);
				expect(result.exitCode).toBe(1);
				expect(result.stderr).toContain("STRIPE_WEBHOOK_SECRET");
			});
	}
	test(`${schema} rejects HTTP URLs for native Redis before connecting`, async () => {
		const result = await validateSchema(
			schema,
			"native",
			"https://redis.example.test",
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("REDIS_URL");
	});
	test(`${schema} accepts native KV without cloud credentials`, async () => {
		expect(await validateSchema(schema, "native")).toEqual({
			stdout: "",
			stderr: "",
			exitCode: 0,
		});
	});
	test(`${schema} retains cloud defaults for unset and empty flags`, async () => {
		for (const mode of ["default", "empty"] as const)
			expect(await validateSchema(schema, mode)).toEqual({
				stdout: "",
				stderr: "",
				exitCode: 0,
			});
	});
	if (schema !== "packages/trpc" && schema !== "packages/auth")
		test(`${schema} retains required cloud credential validation`, async () => {
			const result = await validateSchema(schema, "cloud-missing");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("KV_REST_API_URL");
			expect(result.stderr).toContain("KV_REST_API_TOKEN");
		});
}
