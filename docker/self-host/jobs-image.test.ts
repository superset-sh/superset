import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "../..");
const owned: string[] = [];
afterEach(() => {
	for (const path of owned.splice(0))
		rmSync(path, { recursive: true, force: true });
});
const sourceFiles = [
	"package.json",
	"docker/self-host/queue.ts",
	"docker/self-host/scheduler.ts",
	"packages/shared/src/self-host-queue.ts",
];
function stage(files = sourceFiles) {
	const path = mkdtempSync("/tmp/jobs-image-");
	owned.push(path);
	for (const file of files) {
		const target = join(path, file);
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(join(root, file), target);
	}
	return path;
}
function importCopied(path: string) {
	writeFileSync(
		join(path, "fixture.test.ts"),
		`import {expect,mock,spyOn,test} from "bun:test";
const deny=()=>{throw Error("Unexpected external operation")};
globalThis.fetch=Object.assign(async()=>deny(),{preconnect:deny});
const net=await import("node:net");spyOn(net.Socket.prototype,"connect").mockImplementation(deny);
const cp=await import("node:child_process");for(const key of ["spawn","spawnSync","exec","execSync","execFile","execFileSync"] as const)spyOn(cp,key).mockImplementation(deny);
spyOn(Bun,"spawn").mockImplementation(deny);spyOn(Bun,"spawnSync").mockImplementation(deny);spyOn(Bun,"serve").mockImplementation(deny);mock.module("dotenv",()=>({config:deny}));
const {DurableQueue}=await import("./docker/self-host/queue");
const {NativeScheduler,schedulerOptionsFromEnvironment}=await import("./docker/self-host/scheduler");
const shared=await import("./packages/shared/src/self-host-queue");
test("genuine copied module imports have no external initialization",()=>{
expect(typeof DurableQueue).toBe("function");expect(typeof NativeScheduler).toBe("function");expect(shared.SELF_HOST_QUEUE_HEADER).toBe("x-self-host-queue");
expect(schedulerOptionsFromEnvironment({})).toBeNull();
expect(schedulerOptionsFromEnvironment({SELF_HOST_QUEUE:"1",QUEUE_API_URL:"http://api:3000",SELF_HOST_QUEUE_SECRET:"fake-owned-secret"})).toEqual({apiOrigin:"http://api:3000",secret:"fake-owned-secret",analyticsEnabled:false});
});
test("missing queue configuration refuses before opening a database",()=>{
const database="./must-not-create.sqlite";
expect(()=>new DurableQueue({database,apiOrigin:"",deliveryOrigin:"",secret:""})).toThrow();
expect(()=>new DurableQueue({database,apiOrigin:"https://api.fixture.invalid",deliveryOrigin:"http://api:3000",secret:"short"})).toThrow();
expect(require("node:fs").existsSync(database)).toBe(false);
});`,
	);
	return spawnSync(
		process.execPath,
		["--no-env-file", "test", join(path, "fixture.test.ts")],
		{
			cwd: path,
			env: { PATH: "/usr/bin:/bin", TMPDIR: path },
			encoding: "utf8",
			timeout: 10_000,
		},
	);
}
function instructions() {
	return readFileSync(join(import.meta.dirname, "jobs.Dockerfile"), "utf8")
		.replace(/\\\n\s*/g, " ")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => {
			const boundary = line.indexOf(" ");
			return { name: line.slice(0, boundary), value: line.slice(boundary + 1) };
		});
}
test("proposed minimal copy layout imports genuine dependency-free job modules", () => {
	const path = stage();
	const child = importCopied(path);
	process.stdout.write(child.stdout);
	process.stderr.write(child.stderr);
	if (child.error) throw child.error;
	expect(child.status).toBe(0);
	expect(existsSync(join(path, "node_modules"))).toBe(false);
});
test("declared Docker COPY layout preserves genuine imports", () => {
	const copy = instructions()
		.filter(({ name }) => name === "COPY")
		.map(({ value }) => {
			const [source, destination, ...extra] = value.split(/\s+/);
			if (!source || !destination || extra.length)
				throw Error("Unsupported COPY contract");
			expect(destination).toBe(`./${source}`);
			return source;
		});
	expect(copy).toEqual(sourceFiles);
	const child = importCopied(stage(copy));
	process.stdout.write(child.stdout);
	process.stderr.write(child.stderr);
	if (child.error) throw child.error;
	expect(child.status).toBe(0);
});
test("source Bun version and immutable digest gate executes before packaging", () => {
	const gate = instructions().find(
		({ name, value }) => name === "RUN" && value.startsWith("bun -e "),
	)?.value;
	if (!gate) throw Error("Missing source version gate");
	const path = stage();
	const run = (image: string) =>
		spawnSync("/bin/sh", ["-c", gate], {
			cwd: path,
			env: {
				PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
				BUN_IMAGE: image,
				TMPDIR: path,
			},
			encoding: "utf8",
			timeout: 10_000,
		});
	expect(run(`fixture.invalid/bun@sha256:${"a".repeat(64)}`).status).toBe(0);
	expect(run("fixture.invalid/bun:latest").status).not.toBe(0);
	expect(run("fixture.invalid/bun@sha256:short").status).not.toBe(0);
	const metadata = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
	metadata.packageManager = "bun@0.0.0";
	writeFileSync(join(path, "package.json"), JSON.stringify(metadata));
	expect(run(`fixture.invalid/bun@sha256:${"a".repeat(64)}`).status).not.toBe(
		0,
	);
});
test("queue and scheduler have explicit non-root source entrypoints without runtime defaults", () => {
	const lines = instructions();
	expect(
		lines.filter(({ name }) => name === "ARG").map(({ value }) => value),
	).toEqual(["BUN_IMAGE", "BUN_IMAGE"]);
	expect(lines.filter(({ name }) => name === "ENV")).toEqual([]);
	expect(lines.find(({ name }) => name === "WORKDIR")?.value).toBe("/app");
	expect(lines.find(({ name }) => name === "USER")?.value).toBe("bun");
	expect(
		lines.find(({ name, value }) => name === "RUN" && value.includes("mkdir"))
			?.value,
	).toBe("mkdir -p /data && chown bun:bun /data");
	const targets = lines
		.filter(({ name }) => name === "FROM")
		.map(({ value }) => value);
	expect(targets).toEqual([
		"$" + "{BUN_IMAGE} AS base",
		"base AS queue",
		"base AS scheduler",
	]);
	expect(
		lines
			.filter(({ name }) => name === "CMD")
			.map(({ value }) => JSON.parse(value)),
	).toEqual([
		["bun", "--no-env-file", "docker/self-host/queue.ts"],
		["bun", "--no-env-file", "docker/self-host/scheduler.ts"],
	]);
	expect(
		lines.filter(({ name }) => name === "EXPOSE").map(({ value }) => value),
	).toEqual(["8789"]);
});
