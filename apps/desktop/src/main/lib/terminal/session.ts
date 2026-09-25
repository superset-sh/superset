import "../../terminal-host/xterm-env-polyfill";
import type { Terminal as HeadlessTerminal } from "@xterm/headless";
import type { TerminalSession } from "./types";

export function getSerializedScrollback(session: TerminalSession): string {
	return session.serializer.serialize();
}

export function recoverScrollback(params: {
	existingScrollback: string | null;
	headless: HeadlessTerminal;
}): boolean {
	const { existingScrollback, headless } = params;
	if (existingScrollback) {
		headless.write(existingScrollback);
		return true;
	}
	return false;
}

export function flushSession(session: TerminalSession): void {
	session.dataBatcher.dispose();
	session.headless.dispose();
}
