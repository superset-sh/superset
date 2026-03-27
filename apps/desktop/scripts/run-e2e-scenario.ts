import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCENARIO_SPECS = {
	all: [],
	smoke: ["e2e/specs/launch.smoke.spec.ts"],
} as const;

type ScenarioName = keyof typeof SCENARIO_SPECS;

interface CliOptions {
	scenario: ScenarioName;
	shouldPrepare: boolean;
	passthroughArgs: string[];
}

interface MintedDesktopSession {
	email: string;
	expiresAt: string;
	name: string;
	organizationId: string;
	token: string;
	userId: string;
}

function parseCliArgs(argv: string[]): CliOptions {
	let scenario: ScenarioName = "smoke";
	let scenarioExplicitlySet = false;
	let shouldPrepare = true;
	const passthroughArgs: string[] = [];

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === "--") {
			passthroughArgs.push(...argv.slice(index + 1));
			break;
		}

		if (arg === "--no-prepare") {
			shouldPrepare = false;
			continue;
		}

		if (!scenarioExplicitlySet && arg in SCENARIO_SPECS) {
			scenario = arg as ScenarioName;
			scenarioExplicitlySet = true;
			continue;
		}

		passthroughArgs.push(arg);
	}

	return {
		scenario,
		shouldPrepare,
		passthroughArgs,
	};
}

function createRunId(scenario: ScenarioName): string {
	return `${new Date().toISOString().replaceAll(":", "-")}-${scenario}`;
}

function readBooleanEnv(name: string): boolean {
	const value = process.env[name];
	if (!value) return false;

	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function runCommand(
	args: string[],
	env: NodeJS.ProcessEnv,
	inheritStdout = true,
) {
	return spawnSync(process.execPath, args, {
		cwd: process.cwd(),
		env,
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
		stdio: inheritStdout ? "inherit" : ["ignore", "pipe", "inherit"],
	});
}

function shouldMintDesktopAuth(): boolean {
	if (process.env.DESKTOP_E2E_AUTH_TOKEN) {
		return false;
	}

	return (
		readBooleanEnv("DESKTOP_E2E_AUTH") ||
		Boolean(process.env.DESKTOP_E2E_AUTH_EMAIL)
	);
}

function mintDesktopAuth(env: NodeJS.ProcessEnv): MintedDesktopSession {
	const mintResult = runCommand(["run", "e2e:auth"], env, false);

	if (mintResult.status !== 0) {
		throw new Error("Failed to mint desktop E2E auth session.");
	}

	const stdout = mintResult.stdout?.trim();
	if (!stdout) {
		throw new Error("Desktop E2E auth mint command did not return JSON.");
	}

	return JSON.parse(stdout) as MintedDesktopSession;
}

const { scenario, shouldPrepare, passthroughArgs } = parseCliArgs(
	process.argv.slice(2),
);

const runDir = join(
	process.cwd(),
	"test-results",
	"desktop-e2e",
	"runs",
	createRunId(scenario),
);
const reportFile = join(runDir, "playwright-report.json");

mkdirSync(runDir, { recursive: true });

if (shouldPrepare) {
	const prepareResult = runCommand(["run", "e2e:prepare"], {
		...process.env,
		DESKTOP_E2E_BUILD: "1",
		SKIP_SENTRY_UPLOAD: "1",
	});

	if (prepareResult.status !== 0) {
		console.log(
			JSON.stringify(
				{
					ok: false,
					stage: "prepare",
					scenario,
					exitCode: prepareResult.status ?? 1,
					runDir,
				},
				null,
				2,
			),
		);
		process.exit(prepareResult.status ?? 1);
	}
}

const mintedDesktopAuth = shouldMintDesktopAuth()
	? mintDesktopAuth({
			...process.env,
			DESKTOP_E2E_AUTH: "1",
		})
	: null;

const scenarioSpecs = SCENARIO_SPECS[scenario];
const testArgs = [
	"x",
	"playwright",
	"test",
	"-c",
	"e2e/playwright.config.mjs",
	"--reporter=json",
	...scenarioSpecs,
	...passthroughArgs,
];

const testResult = runCommand(
	testArgs,
	{
		...process.env,
		DESKTOP_E2E_ARTIFACTS_DIR: runDir,
		DESKTOP_E2E_ALWAYS_CAPTURE: process.env.DESKTOP_E2E_ALWAYS_CAPTURE ?? "1",
		...(mintedDesktopAuth
			? {
					DESKTOP_E2E_AUTH_TOKEN: mintedDesktopAuth.token,
					DESKTOP_E2E_AUTH_EXPIRES_AT: mintedDesktopAuth.expiresAt,
					DESKTOP_E2E_EXPECT_AUTHENTICATED: "1",
				}
			: {}),
	},
	false,
);

const stdout = testResult.stdout ?? "";

writeFileSync(reportFile, stdout);

console.log(
	JSON.stringify(
		{
			ok: testResult.status === 0,
			stage: "test",
			scenario,
			exitCode: testResult.status ?? 1,
			runDir,
			reportFile,
			auth: mintedDesktopAuth
				? {
						email: mintedDesktopAuth.email,
						expiresAt: mintedDesktopAuth.expiresAt,
						organizationId: mintedDesktopAuth.organizationId,
						userId: mintedDesktopAuth.userId,
					}
				: null,
		},
		null,
		2,
	),
);

process.exit(testResult.status ?? 1);
