import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface DeployTarget {
	app: string;
	config: string;
	regions: string[];
	strategy?: string;
	scaleBeforeDeploy: boolean;
}

const TARGETS: Record<string, DeployTarget> = {
	production: {
		app: "superset-relay",
		config: "apps/relay/fly.toml",
		regions: ["sjc", "iad", "fra", "nrt", "sin", "gru"],
		strategy: "rolling",
		scaleBeforeDeploy: true,
	},
	staging: {
		app: "superset-relay-staging",
		config: "apps/relay/fly.staging.toml",
		regions: ["sjc", "iad", "fra"],
		scaleBeforeDeploy: false,
	},
};

function usage(): void {
	console.log(`Usage: bun run apps/relay/scripts/deploy.ts [--staging] [--dry-run] [--skip-smoke]

Deploys the relay app to Fly.io and verifies regional /health responses.

Options:
  --staging     Deploy superset-relay-staging using fly.staging.toml.
  --dry-run     Print commands without calling fly or remote health endpoints.
  --skip-smoke  Skip the post-deploy regional health checks.
  --help        Show this help text.`);
}

function repoRoot(): string {
	let dir = dirname(fileURLToPath(import.meta.url));
	while (dir !== dirname(dir)) {
		if (
			existsSync(join(dir, "package.json")) &&
			existsSync(join(dir, "apps"))
		) {
			return dir;
		}
		dir = dirname(dir);
	}
	throw new Error("Could not locate repository root");
}

function run(command: string, args: string[], dryRun: boolean): void {
	const printable = [command, ...args].join(" ");
	if (dryRun) {
		console.log(`[dry-run] ${printable}`);
		return;
	}
	const result = spawnSync(command, args, {
		stdio: "inherit",
		cwd: repoRoot(),
	});
	if (result.error) {
		throw new Error(`${command} failed: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`${command} exited with code ${result.status}`);
	}
}

function parseArgs(argv: string[]): {
	targetName: "production" | "staging";
	dryRun: boolean;
	skipSmoke: boolean;
} {
	let targetName: "production" | "staging" = "production";
	let dryRun = false;
	let skipSmoke = false;

	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			usage();
			process.exit(0);
		}
		if (arg === "--staging") {
			targetName = "staging";
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--skip-smoke") {
			skipSmoke = true;
			continue;
		}
		throw new Error(`Unknown option: ${arg}`);
	}

	return { targetName, dryRun, skipSmoke };
}

async function smokeTest(
	hostname: string,
	regions: string[],
	dryRun: boolean,
): Promise<void> {
	if (dryRun) {
		for (const region of regions) {
			console.log(
				`[dry-run] GET https://${hostname}/health fly-prefer-region:${region}`,
			);
		}
		return;
	}

	let failures = 0;
	for (const region of regions) {
		process.stdout.write(`  ${region.padEnd(4)} `);
		try {
			const response = await fetch(`https://${hostname}/health`, {
				headers: { "fly-prefer-region": region },
				signal: AbortSignal.timeout(8000),
			});
			const body = await response.text();
			let got = "";
			try {
				const json = JSON.parse(body) as { region?: unknown };
				got = typeof json.region === "string" ? json.region : "";
			} catch {
				got = "";
			}
			if (response.ok && got === region) {
				console.log(`OK ${body}`);
			} else {
				console.log(`FAIL wanted region=${region}, got=${got}: ${body}`);
				failures++;
			}
		} catch (error) {
			console.log(`FAIL ${(error as Error).message}`);
			failures++;
		}
	}

	if (failures > 0) {
		throw new Error(
			`smoke test failed: ${failures} region(s) did not respond as expected`,
		);
	}
	console.log(`==> smoke test OK across ${regions.length} region(s)`);
}

async function main(): Promise<void> {
	const { targetName, dryRun, skipSmoke } = parseArgs(process.argv.slice(2));
	const target = TARGETS[targetName];
	const count = target.regions.length;
	const regionList = target.regions.join(",");

	if (target.scaleBeforeDeploy) {
		console.log(
			`==> fly scale count: ${count} machines, 1 per region across ${regionList}`,
		);
		run(
			"fly",
			[
				"scale",
				"count",
				`app=${count}`,
				"--region",
				regionList,
				"--max-per-region",
				"1",
				"--app",
				target.app,
				"--yes",
			],
			dryRun,
		);
	}

	console.log(`==> fly deploy (${target.app})`);
	const deployArgs = [
		"deploy",
		"--config",
		target.config,
		"--dockerfile",
		"apps/relay/Dockerfile",
		"--app",
		target.app,
	];
	if (target.strategy) {
		deployArgs.push("--strategy", target.strategy);
	}
	deployArgs.push(".");
	run("fly", deployArgs, dryRun);

	if (!target.scaleBeforeDeploy) {
		console.log(
			`==> fly scale count: ${count} machines, 1 per region across ${regionList}`,
		);
		run(
			"fly",
			[
				"scale",
				"count",
				`app=${count}`,
				"--region",
				regionList,
				"--max-per-region",
				"1",
				"--app",
				target.app,
				"--yes",
			],
			dryRun,
		);
	}

	console.log("==> Status");
	run("fly", ["status", "--app", target.app], dryRun);

	if (!skipSmoke) {
		console.log("==> Smoke test");
		await smokeTest(`${target.app}.fly.dev`, target.regions, dryRun);
	}
}

main().catch((error) => {
	console.error((error as Error).message);
	process.exit(1);
});
