import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = new URL("../../../../", import.meta.url);
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
	mode: "native" | "default" | "empty" | "cloud-missing" | "invalid",
) {
	const runtimeEnv: Record<string, string> = {
		...fakeEnv,
		PATH: process.env.PATH ?? "",
	};
	delete runtimeEnv.SKIP_ENV_VALIDATION;
	delete runtimeEnv.SMTP_URL;
	delete runtimeEnv.EMAIL_FROM;
	if (mode === "native") runtimeEnv.SMTP_URL = "smtp://127.0.0.1:2525";
	if (mode === "invalid") runtimeEnv.SMTP_URL = "https://example.test";
	if (mode === "empty") {
		runtimeEnv.SMTP_URL = "";
		runtimeEnv.EMAIL_FROM = "";
	}
	if (mode === "native" || mode === "cloud-missing")
		delete runtimeEnv.RESEND_API_KEY;
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
		if ((env.SMTP_URL || undefined) !== ${mode === "native" ? JSON.stringify("smtp://127.0.0.1:2525") : "undefined"}) throw Error("SMTP configuration changed");

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
	test(`${schema} accepts SMTP without a cloud email key`, async () => {
		expect(await validateSchema(schema, "native")).toEqual({
			stdout: "",
			stderr: "",
			exitCode: 0,
		});
	});
	test(`${schema} retains cloud email defaults for unset and empty SMTP`, async () => {
		for (const mode of ["default", "empty"] as const)
			expect(await validateSchema(schema, mode)).toEqual({
				stdout: "",
				stderr: "",
				exitCode: 0,
			});
	});
	if (schema !== "packages/auth")
		test(`${schema} retains required cloud credential validation`, async () => {
			const result = await validateSchema(schema, "cloud-missing");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("RESEND_API_KEY");
		});
}

for (const schema of schemas.filter((schema) => schema !== "packages/auth")) {
	test(`${schema} rejects non-SMTP URLs`, async () => {
		const result = await validateSchema(schema, "invalid");
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("SMTP_URL");
	});
}
