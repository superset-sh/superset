import { execFileSync, fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repo = resolve(import.meta.dirname, "../../..");
const baseline = execFileSync(
	"git",
	["rev-parse", process.env.BENCH_BASELINE ?? "HEAD"],
	{ cwd: repo, encoding: "utf8" },
).trim();
const output = resolve(
	process.argv[2] ?? join(repo, ".cache/watcher-terminal-benchmark"),
);
const fileCount = Number(process.env.BENCH_FILES ?? 50_000);
const workspaceCount = Number(process.env.BENCH_WORKSPACES ?? 2);
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
const cancel = process.env.BENCH_CANCEL === "1";
const durationMs = Number(process.env.BENCH_DURATION_MS ?? 5_000);
await mkdir(output, { recursive: true });
const roots = Array.from({ length: workspaceCount }, (_, i) =>
	join(output, `fixture-${i}`),
);
for (const root of roots) {
	await mkdir(root, { recursive: true });
	execFileSync("git", ["init", "-q", root]);
	for (let first = 0; first < fileCount; first += 100) {
		const dir = join(root, `src-${first / 100}`);
		await mkdir(dir, { recursive: true });
		await Promise.all(
			Array.from({ length: Math.min(100, fileCount - first) }, (_, i) =>
				writeFile(
					join(dir, `file-${first + i}.ts`),
					"export const value = 1;\n",
				),
			),
		);
	}
}
console.log(`Fixture: ${workspaceCount} workspaces × ${fileCount} files`);
for (const [name, owner] of [
	["node-pty", "host-service"],
	["@parcel/watcher", "workspace-fs"],
] as const) {
	const require = createRequire(join(repo, `packages/${owner}/package.json`));
	const target = join(output, "node_modules", name);
	await mkdir(dirname(target), { recursive: true });
	await symlink(dirname(require.resolve(`${name}/package.json`)), target).catch(
		(error) => {
			if (error.code !== "EEXIST") throw error;
		},
	);
}
const originalFiles = [
	"packages/host-service/src/events/git-watcher.ts",
	"packages/host-service/src/runtime/filesystem/filesystem.ts",
	"packages/host-service/src/workers/host-worker-pool.ts",
	"packages/workspace-fs/src/watch.ts",
	"packages/workspace-fs/src/find-nested-repos.ts",
	"packages/workspace-fs/src/host/service.ts",
];
const originals = new Map(
	originalFiles.map((path) => [
		join(repo, path),
		execFileSync("git", ["show", `${baseline}:${path}`], {
			cwd: repo,
			encoding: "utf8",
		}),
	]),
);
function sourcePlugin(variant: string): import("bun").BunPlugin {
	return {
		name: "watcher-benchmark-sources",
		setup(build) {
			build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
				let contents = variant === "before" ? originals.get(path) : undefined;
				if (path.endsWith("/workspace-fs/src/find-nested-repos.ts")) {
					contents ??= await readFile(path, "utf8");
					contents =
						'import { appendFileSync as recordScan } from "node:fs";\n' +
						contents.replace(
							"const maxQueuedDirs = options.maxQueuedDirs",
							'if (process.env.BENCH_SCAN_LOG) recordScan(process.env.BENCH_SCAN_LOG, JSON.stringify({ rootPath, startedAt: Date.now() }) + "\\n");\n\tconst maxQueuedDirs = options.maxQueuedDirs',
						);
				}
				return contents === undefined ? undefined : { contents, loader: "ts" };
			});
		},
	};
}
for (const variant of ["before", "after"] as const) {
	const result = await Bun.build({
		entrypoints: [join(import.meta.dirname, "watcher-terminal-bench/host.ts")],
		target: "node",
		format: "esm",
		external: ["node-pty", "@parcel/watcher"],
		outdir: output,
		naming: `${variant}.mjs`,
		plugins: [sourcePlugin(variant)],
	});
	if (!result.success) throw new Error(result.logs.join("\n"));
}
const worker = await Bun.build({
	entrypoints: [join(repo, "packages/host-service/src/workers/host-worker.ts")],
	target: "node",
	format: "esm",
	outdir: output,
	naming: "host-worker.mjs",
	plugins: [sourcePlugin("after")],
});
if (!worker.success) throw new Error(worker.logs.join("\n"));

function summary(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const percentile = (p: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
	return {
		samples: sorted.length,
		p50: percentile(0.5),
		p95: percentile(0.95),
		p99: percentile(0.99),
		max: sorted.at(-1) ?? null,
	};
}
async function run(variant: string, round: number) {
	const scanLog = join(output, `${variant}-${round}-scans.jsonl`);
	await writeFile(scanLog, "");
	const child = fork(join(output, `${variant}.mjs`), [], {
		execPath: "node",
		execArgv: [],
		silent: true,
		env: {
			...process.env,
			BENCH_ROOTS: JSON.stringify(roots),
			BENCH_SCAN_LOG: scanLog,
			SUPERSET_HOST_WORKER_SCRIPT_PATH: join(output, "host-worker.mjs"),
		},
	});
	const timeout = setTimeout(() => child.kill("SIGKILL"), durationMs + 30_000);
	timeout.unref();
	child.once("exit", () => clearTimeout(timeout));
	let stderr = "";
	child.on("exit", (code, signal) => {
		if (code !== 0) console.error({ variant, code, signal, stderr });
	});
	child.stderr?.on("data", (data) => {
		stderr += data;
	});
	const ready = await Promise.race([
		once(child, "message"),
		once(child, "exit").then(() => {
			throw new Error(stderr);
		}),
	]);
	const port = ready[0].port as number;
	const socket = createConnection({ port, host: "127.0.0.1" });
	socket.setNoDelay(true);
	await once(socket, "connect");
	const pending = new Map<number, number>();
	const echoes: number[] = [];
	const outputAges: number[] = [];
	const attachments: number[] = [];
	let buffer = "";
	let sequence = 0;
	let measuring = false;
	socket.on("data", (data) => {
		buffer += data.toString();
		let index = buffer.indexOf("\n");
		while (index !== -1) {
			const line = buffer.slice(0, index).trim();
			buffer = buffer.slice(index + 1);
			if (line.startsWith("IN ")) {
				const id = Number(line.slice(3));
				const start = pending.get(id);
				if (start !== undefined) {
					echoes.push(performance.now() - start);
					pending.delete(id);
				}
			} else if (measuring && line.startsWith("OUT "))
				outputAges.push(Date.now() - Number(line.slice(4)));
			index = buffer.indexOf("\n");
		}
	});
	await delay(100);
	measuring = true;
	const echoTimer = setInterval(() => {
		const id = sequence++;
		pending.set(id, performance.now());
		socket.write(`IN ${id}\n`);
	}, 10);
	const attachTimer = setInterval(() => {
		const start = performance.now();
		const attach = createConnection({ port, host: "127.0.0.1" });
		attach.once("data", () => {
			attachments.push(performance.now() - start);
			attach.destroy();
		});
		attach.on("error", () => {});
	}, 20);
	child.send({ type: "start" });
	if (cancel)
		setTimeout(() => child.send({ type: "cancel", sentAt: Date.now() }), 20);
	await delay(durationMs);
	clearInterval(echoTimer);
	clearInterval(attachTimer);
	await delay(200);
	child.send({ type: "stop" });
	const [metrics] = await Promise.race([
		once(child, "message"),
		once(child, "exit").then(() => {
			throw new Error(`Benchmark exited before reporting metrics: ${stderr}`);
		}),
	]);
	socket.destroy();
	await once(child, "exit");
	const scanStarts = (await readFile(scanLog, "utf8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { rootPath: string; startedAt: number });
	const result = {
		scansStarted: scanStarts.length,
		scansStartedAfterCancel: metrics.cancelledAt
			? scanStarts.filter((scan) => scan.startedAt > metrics.cancelledAt).length
			: null,
		variant,
		round,
		echoMs: summary(echoes),
		outputAgeMs: summary(outputAges),
		attachMs: summary(attachments),
		pendingEchoes: pending.size,
		...metrics,
		stderr,
	};
	console.log(JSON.stringify(result));
	return result;
}
const results = [];
for (let round = 0; round < rounds; round++) {
	for (const variant of round % 2 ? ["after", "before"] : ["before", "after"])
		results.push(await run(variant, round));
}
await writeFile(
	join(output, "results.json"),
	JSON.stringify(
		{
			baseline,
			measuredAt: new Date().toISOString(),
			platform: process.platform,
			arch: process.arch,
			nodeVersion: execFileSync("node", ["--version"], {
				encoding: "utf8",
			}).trim(),
			fileCount,
			cancel,
			workspaceCount,
			durationMs,
			results,
		},
		null,
		2,
	),
);
