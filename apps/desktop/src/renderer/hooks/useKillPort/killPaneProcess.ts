import type { EnrichedPort } from "shared/types";
import {
	getPortsToKillForPane,
	type KillablePort,
} from "./getPortsToKillForPane";

const CTRL_C = "\u0003";
const SESSION_CHECK_RETRIES = 5;
const SESSION_CHECK_DELAY_MS = 100;

interface KillPortResult {
	success: boolean;
	error?: string;
}

interface KillPortsResult {
	results: KillPortResult[];
	failedCount: number;
}

interface PaneSessionInfo {
	isAlive: boolean;
}

interface WaitForPaneToStopResult {
	didStop: boolean;
	error?: unknown;
}

interface StopPaneProcessOptions {
	paneId: string;
	getPorts: () => Promise<EnrichedPort[]>;
	killPorts: (ports: KillablePort[]) => Promise<KillPortsResult>;
	writeToTerminal: (input: {
		paneId: string;
		data: string;
		throwOnError?: boolean;
	}) => Promise<unknown>;
	getSession: (paneId: string) => Promise<PaneSessionInfo | null>;
	killPane: (input: { paneId: string }) => Promise<unknown>;
	sleep?: (ms: number) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

function isSessionGoneError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	return (
		message.includes("not found or not alive") ||
		message.includes("session not found")
	);
}

async function waitForPaneToStop({
	paneId,
	getSession,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: Pick<
	StopPaneProcessOptions,
	"paneId" | "getSession" | "sleep"
>): Promise<WaitForPaneToStopResult> {
	for (let attempt = 0; attempt < SESSION_CHECK_RETRIES; attempt++) {
		try {
			const session = await getSession(paneId);
			if (!session?.isAlive) {
				return { didStop: true };
			}
		} catch (error) {
			if (isSessionGoneError(error)) {
				return { didStop: true };
			}
			return {
				didStop: false,
				error,
			};
		}

		if (attempt < SESSION_CHECK_RETRIES - 1) {
			await sleep(SESSION_CHECK_DELAY_MS);
		}
	}

	return { didStop: false };
}

export async function killPaneProcess({
	paneId,
	getPorts,
	killPorts,
	writeToTerminal,
	getSession,
	killPane,
	sleep,
}: StopPaneProcessOptions): Promise<void> {
	const portsToKill = getPortsToKillForPane(await getPorts(), paneId);
	if (portsToKill.length > 0) {
		const { results, failedCount } = await killPorts(portsToKill);
		if (failedCount > 0) {
			const firstFailure = results.find((result) => !result.success);
			throw new Error(
				firstFailure?.error ?? `Failed to close ${failedCount} port(s)`,
			);
		}
	}

	try {
		await writeToTerminal({
			paneId,
			data: CTRL_C,
			throwOnError: true,
		});
	} catch (error) {
		if (!isSessionGoneError(error)) {
			const gracefulStopResult = await waitForPaneToStop({
				paneId,
				getSession,
				sleep,
			});
			if (!gracefulStopResult.didStop) {
				// Continue to the hard-kill fallback below.
			} else {
				return;
			}
		} else {
			return;
		}
	}

	const gracefulStopResult = await waitForPaneToStop({
		paneId,
		getSession,
		sleep,
	});
	if (gracefulStopResult.didStop) {
		return;
	}

	try {
		await killPane({ paneId });
	} catch (error) {
		if (!isSessionGoneError(error)) {
			throw error;
		}
		return;
	}

	const hardStopResult = await waitForPaneToStop({
		paneId,
		getSession,
		sleep,
	});
	if (hardStopResult.didStop) {
		return;
	}
	if (hardStopResult.error) {
		throw hardStopResult.error;
	}
	throw new Error("Failed to stop pane session");
}
