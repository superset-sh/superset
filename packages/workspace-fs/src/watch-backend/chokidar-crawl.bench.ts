import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { chokidarWatchBackend } from "./chokidar-backend";
import type { NativeWatchSubscription } from "./types";

const roots = Number(process.argv[2] ?? 4);
const concurrency = Number(process.argv[3] ?? roots);
if (![1, 4].includes(roots) || ![1, 4].includes(concurrency)) {
	throw new Error("Expected roots and concurrency of 1 or 4");
}
const packageCount = 100;
const visibleFilesPerPackage = 40;
const ignoredFilesPerDirectory = 8;
const fixture = await mkdtemp(path.join(tmpdir(), "chokidar-crawl-"));
const subscriptions: NativeWatchSubscription[] = [];
const deadline = setTimeout(() => {
	console.error("Benchmark exceeded 45 seconds");
	process.exit(1);
}, 45_000);

try {
	const rootPaths = Array.from({ length: roots }, (_, i) =>
		path.join(fixture, `root-${i}`),
	);
	for (const root of rootPaths) {
		for (let i = 0; i < packageCount; i++) {
			for (const dir of ["src", "vendor", "build"]) {
				const directory = path.join(root, "packages", `p${i}`, dir);
				await mkdir(directory, { recursive: true });
				const count =
					dir === "src" ? visibleFilesPerPackage : ignoredFilesPerDirectory;
				for (let file = 0; file < count; file += 8) {
					await Promise.all(
						Array.from({ length: Math.min(8, count - file) }, (_, j) =>
							writeFile(path.join(directory, `file-${file + j}.ts`), "x"),
						),
					);
				}
			}
		}
	}
	const ignore = [
		"**/.git/**",
		"**/.worktrees/**",
		"**/.claude/worktrees/**",
		"**/.conductor/**",
		...Array.from({ length: packageCount }, (_, i) => [
			`packages/p${i}/vendor/**`,
			`packages/p${i}/build/**`,
		]).flat(),
	];
	const lag = monitorEventLoopDelay({ resolution: 10 });
	lag.enable();
	await delay(30);
	lag.reset();
	let peakRss = process.memoryUsage().rss;
	const heartbeatLags: number[] = [];
	let previousBeat = performance.now();
	const heartbeat = setInterval(() => {
		const now = performance.now();
		heartbeatLags.push(Math.max(0, now - previousBeat - 10));
		previousBeat = now;
		peakRss = Math.max(peakRss, process.memoryUsage().rss);
	}, 10);
	const cpuStart = process.cpuUsage();
	const start = performance.now();
	const seen = new Set<string>();
	const errors: unknown[] = [];
	try {
		for (let offset = 0; offset < roots; offset += concurrency) {
			await Promise.all(
				rootPaths.slice(offset, offset + concurrency).map(async (rootPath) => {
					const subscription = await chokidarWatchBackend.subscribe({
						rootPath,
						ignore,
						generation: 1,
						onEvents: (events) => {
							for (const event of events) seen.add(event.path);
						},
						onError: (error) => errors.push(error),
					});
					subscriptions.push(subscription);
				}),
			);
		}
		const attachMs = performance.now() - start;
		const cpu = process.cpuUsage(cpuStart);
		await delay(20);
		clearInterval(heartbeat);
		lag.disable();
		const sentinels = rootPaths.map((root) => path.join(root, "sentinel.ts"));
		for (const root of rootPaths) {
			await writeFile(path.join(root, "packages/p0/vendor/ignored.ts"), "x");
		}
		await Promise.all(sentinels.map((file) => writeFile(file, "x")));
		const eventDeadline = performance.now() + 3_000;
		while (!sentinels.every((file) => seen.has(file))) {
			if (performance.now() > eventDeadline) throw new Error("Missing event");
			await delay(10);
		}
		if (errors.length || [...seen].some((file) => file.includes("/vendor/"))) {
			throw new Error("Unexpected watcher error or ignored event");
		}
		console.log(
			JSON.stringify({
				roots,
				concurrency,
				visibleFiles: roots * packageCount * visibleFilesPerPackage,
				ignoredFiles: roots * packageCount * 2 * ignoredFilesPerDirectory,
				ignorePatternsPerRoot: ignore.length,
				attachMs,
				cpuMs: (cpu.user + cpu.system) / 1000,
				peakRssMiB:
					Math.max(peakRss / 1024, process.resourceUsage().maxRSS) / 1024,
				loopP99Ms: lag.percentile(99) / 1e6,
				loopMaxMs: lag.max / 1e6,
				heartbeatMaxLagMs: Math.max(0, ...heartbeatLags),
				sentinelEvents: sentinels.filter((file) => seen.has(file)).length,
			}),
		);
	} finally {
		clearInterval(heartbeat);
		lag.disable();
	}
} finally {
	await Promise.all(
		subscriptions.map((subscription) => subscription.unsubscribe()),
	);
	await rm(fixture, { recursive: true, force: true });
	clearTimeout(deadline);
}
