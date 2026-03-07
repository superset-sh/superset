import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { setupTerminalHostSignalHandlers } from "../terminal-host/signal-handlers";
import { TerminalSupervisor } from "./supervisor";

function log(
	level: "info" | "warn" | "error",
	message: string,
	data?: unknown,
): void {
	const timestamp = new Date().toISOString();
	const prefix = `[${timestamp}] [terminal-supervisor] [${level.toUpperCase()}]`;
	if (data === undefined) {
		console.log(`${prefix} ${message}`);
		return;
	}

	console.log(`${prefix} ${message}`, data);
}

const supervisor = new TerminalSupervisor(log);

async function main(): Promise<void> {
	log("info", "Terminal supervisor starting...");
	log("info", `Environment: ${process.env.NODE_ENV || "production"}`);
	log("info", `Home directory: ${SUPERSET_HOME_DIR}`);

	setupTerminalHostSignalHandlers({
		log,
		stopServer: () => supervisor.stop(),
	});

	try {
		await supervisor.start();
	} catch (error) {
		log("error", "Failed to start supervisor", {
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	}
}

void main();
