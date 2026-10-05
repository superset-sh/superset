import type { IngestOutcome } from "@/lib/automations/ingestAutomationEvent";

/**
 * Runs `record` once per connection, in order, keeping every outcome.
 *
 * Its own module, importing only a type, so the test for it pulls in no
 * database client: Bun's `mock.module` registrations and module instances are
 * process-wide, and loading the ingest path from a test reached whichever suite
 * ran next.
 *
 * Sequential rather than concurrent, for the reason Linear's fan-out documents:
 * neon-http opens a connection per query, and asking for all of them at one
 * instant starves the proxy's pool.
 */
export async function recordForEachConnection<T extends { id: string }>(
	subscribers: T[],
	record: (connection: T) => Promise<IngestOutcome>,
): Promise<IngestOutcome[]> {
	const outcomes: IngestOutcome[] = [];
	for (const connection of subscribers) {
		// One connection's failure must not cost the others their delivery:
		// Slack retries the whole event, and the ones that already recorded
		// dedupe on replay while the ones that never ran would stay lost.
		outcomes.push(
			await record(connection).catch((error) => {
				console.error(
					`[slack/events] connection ${connection.id} failed:`,
					error,
				);
				return { status: "dispatch_failed", eventId: "" } as IngestOutcome;
			}),
		);
	}
	return outcomes;
}
