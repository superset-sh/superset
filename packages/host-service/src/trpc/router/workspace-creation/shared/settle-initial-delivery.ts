import { TRPCError } from "@trpc/server";
import type { HostDb } from "../../../../db";
import {
	disposeSessionAndWait,
	type InitialCommandDelivery,
} from "../../../../terminal/terminal";
import { toTerminalSessionError } from "../../terminal/errors";

export async function settleInitialDelivery(
	delivery: Pick<InitialCommandDelivery, "settled">,
	terminalId: string,
	db: HostDb,
	dispose: (
		terminalId: string,
		db: HostDb,
	) => Promise<unknown> = disposeSessionAndWait,
): Promise<void> {
	const outcome = await delivery.settled;
	if (!("error" in outcome)) return;
	try {
		await dispose(terminalId, db);
	} catch (error) {
		console.warn("[terminal] Failed to dispose a refused initial delivery", {
			terminalId,
			error,
		});
	}
	const mapped = toTerminalSessionError(outcome);
	throw new TRPCError({
		code: mapped.code,
		message: mapped.message,
		cause: { kind: outcome.kind, deliveryRefused: true },
	});
}
