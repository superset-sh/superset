import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

interface RunSummary {
	auth: {
		email: string;
		expiresAt: string;
		organizationId: string;
		userId: string;
	} | null;
	exitCode: number;
	ok: boolean;
	reportFile: string;
	runDir: string;
	scenario: string;
	stage: string;
}

interface PreviewMetadata {
	authState: {
		expiresAt: string | null;
		tokenPresent: boolean;
	};
	hash: string;
	pathname: string;
	textSample: string;
}

function createPreviewId(): string {
	return `${new Date().toISOString().replaceAll(":", "-")}-signed-in-preview`;
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

function ensureLocalApiIsReachable(apiUrl: string) {
	const sessionUrl = new URL("/api/auth/get-session", apiUrl).toString();
	const response = spawnSync(
		"curl",
		["-sS", "-o", "/dev/null", "-w", "%{http_code}", sessionUrl],
		{
			cwd: process.cwd(),
			encoding: "utf8",
		},
	);

	if (response.status !== 0 || response.stdout.trim() === "000") {
		throw new Error(
			`Desktop preview requires the local API to be running at ${sessionUrl}.`,
		);
	}
}

function findFirstMatchingPath(runDir: string, pattern: RegExp): string | null {
	const searchResult = spawnSync("rg", ["--files", runDir], {
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});

	if (searchResult.status !== 0 || !searchResult.stdout) {
		return null;
	}

	const match = searchResult.stdout
		.split("\n")
		.map((entry) => entry.trim())
		.find((entry) => pattern.test(entry));

	return match ? join(runDir, match) : null;
}

const previewDir = join(
	process.cwd(),
	"test-results",
	"desktop-e2e",
	"previews",
	createPreviewId(),
);
const metadataPath = join(previewDir, "signed-in-app.json");
const screenshotPath = join(previewDir, "signed-in-app.png");
const videoPath = join(previewDir, "signed-in-app.webm");
const reportFile = join(previewDir, "playwright-report.json");

mkdirSync(previewDir, { recursive: true });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3181";
ensureLocalApiIsReachable(apiUrl);

const runResult = runCommand(
	["run", "scripts/run-e2e-scenario.ts", "smoke", ...process.argv.slice(2)],
	{
		...process.env,
		DESKTOP_E2E_ALWAYS_CAPTURE: "1",
		DESKTOP_E2E_AUTH: process.env.DESKTOP_E2E_AUTH ?? "1",
		DESKTOP_E2E_EXPECT_AUTHENTICATED: "1",
		DESKTOP_E2E_METADATA_PATH: metadataPath,
	},
	false,
);

const stdout = runResult.stdout?.trim();
if (!stdout) {
	throw new Error("Desktop preview run did not produce a summary.");
}

const summary = JSON.parse(stdout) as RunSummary;

if (!existsSync(summary.reportFile)) {
	throw new Error("Desktop preview run did not write a Playwright report.");
}

copyFileSync(summary.reportFile, reportFile);

if (!summary.ok) {
	console.log(
		JSON.stringify(
			{
				...summary,
				previewDir,
				reportFile,
			},
			null,
			2,
		),
	);
	process.exit(summary.exitCode || 1);
}

const runScreenshotPath =
	findFirstMatchingPath(summary.runDir, /test-finished-\d+\.png$/) ??
	findFirstMatchingPath(summary.runDir, /\.png$/);
const runVideoPath =
	findFirstMatchingPath(summary.runDir, /main-window\.webm$/) ??
	findFirstMatchingPath(summary.runDir, /\.webm$/);

if (!runScreenshotPath) {
	throw new Error("Desktop preview run did not produce a screenshot.");
}

copyFileSync(runScreenshotPath, screenshotPath);

if (runVideoPath) {
	copyFileSync(runVideoPath, videoPath);
}

const metadata = JSON.parse(
	readFileSync(metadataPath, "utf8"),
) as PreviewMetadata;

writeFileSync(
	metadataPath,
	JSON.stringify(
		{
			...metadata,
			auth: summary.auth,
			reportFile,
			runDir: summary.runDir,
			screenshotPath,
			videoPath: existsSync(videoPath) ? videoPath : null,
		},
		null,
		2,
	),
);

console.log(
	JSON.stringify(
		{
			previewDir,
			reportFile,
			runDir: summary.runDir,
			screenshotPath,
			videoPath: existsSync(videoPath) ? videoPath : null,
			auth: summary.auth,
			hash: metadata.hash,
		},
		null,
		2,
	),
);
