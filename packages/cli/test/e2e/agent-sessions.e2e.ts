import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliE2EHarness, type CommandEvidence, sha256 } from "./harness";

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);
const artifactsFlag = process.argv.indexOf("--artifacts");
const requestedArtifactsDir =
	artifactsFlag >= 0 ? process.argv[artifactsFlag + 1] : undefined;
const artifactsDir = requestedArtifactsDir ?? "test-results/cli-agent-sessions";

function json<T>(command: CommandEvidence): T {
	if (command.exitCode !== 0) {
		throw new Error(`${command.name} failed: ${command.stderr}`);
	}
	return JSON.parse(command.stdout) as T;
}

function promptDescriptor(prompt: string): string {
	return `<prompt bytes=${Buffer.byteLength(prompt)} sha256=${sha256(prompt)}>`;
}

interface SessionLaunch {
	kind: "terminal";
	sessionId: string;
	label: string;
}

interface SessionListItem {
	status: string;
	agent: string;
	workspaceId: string;
	host: string;
	hostId: string;
	lastEventAt: string;
	sessionId: string;
}

interface SessionRead {
	terminalId: string;
	workspaceId: string;
	status: string;
	output: string;
	truncated: boolean;
}

interface SessionWait {
	terminalId?: string;
	status: string;
}

const harness = new CliE2EHarness({ repoRoot, artifactsDir });

let failure: unknown;

try {
	await harness.start();

	const largePrompt = [
		"Verify the complete prompt reaches the fake agent.\n",
		"x".repeat(87_900),
		"\nUnicode tail: 雪だるま ☃️ — fin\n",
	].join("");
	const largeLaunchCommand = await harness.cli({
		name: "launch an 88 KB agent prompt",
		args: [
			"agents",
			"create",
			"--workspace",
			harness.workspaceId,
			"--agent",
			"e2e",
			"--prompt",
			largePrompt,
		],
		displayArgs: [
			"agents",
			"create",
			"--workspace",
			harness.workspaceId,
			"--agent",
			"e2e",
			"--prompt",
			promptDescriptor(largePrompt),
		],
	});
	const largeLaunch = json<SessionLaunch>(largeLaunchCommand);
	harness.check(
		"large launch returned a terminal session",
		largeLaunch.kind === "terminal" && Boolean(largeLaunch.sessionId),
		`session ${largeLaunch.sessionId}`,
	);
	await harness.waitForCaptureCount(1);
	const initialCapture = harness.readCapture()[0];
	harness.check(
		"large prompt arrived byte-for-byte",
		initialCapture?.prompt === largePrompt,
		`${Buffer.byteLength(largePrompt)} bytes; sha256 ${sha256(largePrompt)}`,
	);
	// Prompt capture precedes the fake agent's initial Stop hook. Give that
	// asynchronous HTTP hook time to persist the binding before listing it.
	await Bun.sleep(250);

	const listCommand = await harness.cli({
		name: "list live local agent sessions",
		args: ["agents", "sessions", "list", "--local"],
	});
	const listed = json<SessionListItem[]>(listCommand);
	const listedLarge = listed.find(
		(session) => session.sessionId === largeLaunch.sessionId,
	);
	harness.check(
		"sessions list exposes identity, workspace, agent, and state",
		listedLarge?.workspaceId === harness.workspaceId &&
			listedLarge.agent === "custom:e2e" &&
			listedLarge.status === "idle",
		`status ${listedLarge?.status}; workspace ${listedLarge?.workspaceId}; agent ${listedLarge?.agent}`,
	);

	const readCommand = await harness.cli({
		name: "read a live session without attaching",
		args: [
			"agents",
			"sessions",
			"read",
			largeLaunch.sessionId,
			"--local",
			"--lines",
			"40",
		],
	});
	const initialRead = json<SessionRead>(readCommand);
	harness.check(
		"headless read returns the agent acknowledgement",
		initialRead.output.includes(`sha256=${sha256(largePrompt)}`) &&
			initialRead.status === "idle",
		`idle snapshot contains the ${sha256(largePrompt).slice(0, 12)}… digest`,
	);

	const multilinePrompt = "first line\nsecond line with 雪\nthird line";
	const multilineResult = json<{
		final: SessionWait;
		read: SessionRead;
	}>(
		await harness.cli({
			name: "send multiline stdin and wait for idle",
			args: [
				"agents",
				"sessions",
				"send",
				largeLaunch.sessionId,
				"--local",
				"--wait",
				"--timeout",
				"5s",
			],
			stdin: multilinePrompt,
			displayArgs: [
				"agents",
				"sessions",
				"send",
				largeLaunch.sessionId,
				"--local",
				"--wait",
				"--timeout",
				"5s",
				"< multiline.txt",
			],
		}),
	);
	await harness.waitForCaptureCount(2);
	harness.check(
		"multiline stdin remains one semantic prompt",
		harness.readCapture()[1]?.prompt === multilinePrompt &&
			multilineResult.final.status === "idle",
		`${Buffer.byteLength(multilinePrompt)} exact bytes; final state idle`,
	);

	await harness.restartHost();
	const restartedRead = json<SessionRead>(
		await harness.cli({
			name: "read the same PTY after host-service restart",
			args: [
				"agents",
				"sessions",
				"read",
				largeLaunch.sessionId,
				"--local",
				"--lines",
				"40",
			],
		}),
	);
	const restartPrompt = "continue after host restart";
	const restartedSend = json<{ final: SessionWait }>(
		await harness.cli({
			name: "continue the same PTY after host-service restart",
			args: [
				"agents",
				"sessions",
				"send",
				largeLaunch.sessionId,
				restartPrompt,
				"--local",
				"--wait",
				"--timeout",
				"5s",
			],
		}),
	);
	await harness.waitForCaptureCount(3);
	harness.check(
		"read and send adopt a daemon-owned session after host restart",
		restartedRead.terminalId === largeLaunch.sessionId &&
			harness.readCapture()[2]?.prompt === restartPrompt &&
			restartedSend.final.status === "idle",
		"same terminal id, exact follow-up, final state idle",
	);

	const missingLaunch = await harness.cli({
		name: "reject an executable that cannot launch",
		args: [
			"agents",
			"create",
			"--workspace",
			harness.workspaceId,
			"--agent",
			"e2e-missing",
			"--prompt",
			"this must not report a session id",
		],
	});
	harness.check(
		"immediate exec failure cannot report false success",
		missingLaunch.exitCode !== 0 &&
			!missingLaunch.stdout.includes("sessionId") &&
			missingLaunch.stderr.includes("failed"),
		`exit ${missingLaunch.exitCode}; no session id emitted`,
	);

	const exitResult = json<{ final: SessionWait; read: null }>(
		await harness.cli({
			name: "exit a live fake-agent process",
			args: [
				"agents",
				"sessions",
				"send",
				largeLaunch.sessionId,
				"EXIT",
				"--local",
				"--wait",
				"--timeout",
				"5s",
			],
		}),
	);
	const exitedRead = await harness.cli({
		name: "reject a read after the agent process exited",
		args: ["agents", "sessions", "read", largeLaunch.sessionId, "--local"],
	});
	harness.check(
		"exited sessions are not silently recreated",
		exitResult.final.status === "exited" &&
			exitResult.read === null &&
			exitedRead.exitCode !== 0,
		"send observed exited; subsequent read failed",
	);
} catch (error) {
	failure = error;
} finally {
	await harness.finish(failure);
}

if (failure) throw failure;

const passed = harness.assertions.filter(
	(assertion) => assertion.passed,
).length;
console.log(
	`CLI agent-session E2E passed: ${passed}/${harness.assertions.length} assertions, ${harness.commands.length} commands`,
);
console.log(`Artifacts: ${resolve(repoRoot, artifactsDir)}`);
