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
async function validate(
	schema: string,
	mode: "native" | "default" | "empty" | "cloud-missing" | "missing-secret",
) {
	const runtimeEnv: Record<string, string> = {
		...fakeEnv,
		PATH: process.env.PATH ?? "",
	};
	for (const key of [
		"SELF_HOST_QUEUE",
		"SELF_HOST_QUEUE_URL",
		"SELF_HOST_QUEUE_SECRET",
		"SKIP_ENV_VALIDATION",
	])
		delete runtimeEnv[key];
	if (mode === "native" || mode === "missing-secret") {
		runtimeEnv.SELF_HOST_QUEUE = "1";
		if (mode === "native")
			runtimeEnv.SELF_HOST_QUEUE_SECRET =
				"owned-env-native-queue-secret-0123456789";
	}
	if (mode === "empty") {
		runtimeEnv.SELF_HOST_QUEUE = "";
		runtimeEnv.SELF_HOST_QUEUE_URL = "";
		runtimeEnv.SELF_HOST_QUEUE_SECRET = "";
	}
	if (
		mode === "native" ||
		mode === "missing-secret" ||
		mode === "cloud-missing"
	)
		for (const key of [
			"QSTASH_TOKEN",
			"QSTASH_URL",
			"QSTASH_CURRENT_SIGNING_KEY",
			"QSTASH_NEXT_SIGNING_KEY",
		])
			delete runtimeEnv[key];
	const envPath = new URL(`${schema}/src/env.ts`, root).pathname;
	const child = Bun.spawn(
		[
			process.execPath,
			"--no-env-file",
			"-e",
			`
		import {mock} from "bun:test";import {createRequire} from "node:module";import {dirname} from "node:path";
		mock.module("dotenv",()=>({config:()=>({parsed:{}})}));
		const require=createRequire(${JSON.stringify(envPath)});let core;try{core=require.resolve("@t3-oss/env-core");}catch{const next=require.resolve("@t3-oss/env-nextjs");core=require.resolve("@t3-oss/env-core",{paths:[dirname(next)]});}
		const actual=await import(core);const original=actual.createEnv;mock.module(core,()=>({...actual,createEnv:opts=>original({...opts,skipValidation:false})}));
		const {env}=await import(${JSON.stringify(envPath)});
		if(env.SELF_HOST_QUEUE!==${JSON.stringify(mode === "native" || mode === "missing-secret" ? "1" : "0")}||env.SELF_HOST_QUEUE_URL!=="http://127.0.0.1:8789")throw Error("Queue defaults changed");
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
	test(`${schema} validates native queue without cloud credentials`, async () => {
		expect(await validate(schema, "native")).toEqual({
			stdout: "",
			stderr: "",
			exitCode: 0,
		});
	});
	test(`${schema} preserves cloud defaults for unset and empty queue flags`, async () => {
		for (const mode of ["default", "empty"] as const)
			expect(await validate(schema, mode)).toEqual({
				stdout: "",
				stderr: "",
				exitCode: 0,
			});
	});
	test(`${schema} rejects native mode without a strong delivery secret`, async () => {
		const result = await validate(schema, "missing-secret");
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("SELF_HOST_QUEUE_SECRET");
	});
	if (["packages/auth", "packages/trpc", "apps/api"].includes(schema))
		test(`${schema} retains required cloud queue credentials`, async () => {
			const result = await validate(schema, "cloud-missing");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("QSTASH_TOKEN");
		});
}
