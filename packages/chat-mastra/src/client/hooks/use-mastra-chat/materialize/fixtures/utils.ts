import { readFileSync } from "node:fs";
import path from "node:path";
import type { MastraDisplayStateSnapshot } from "../display-state";
import type { MastraChatEventEnvelope } from "../types";

export interface ProbeFixtureRecord {
	timestamp: string;
	sessionId?: string;
	sequenceHint?: number;
	channel: "service" | "submit" | "harness";
	payload: unknown;
}

function fixtureVariantDir(scenario: string, variant = "default"): string {
	return path.join(import.meta.dir, scenario, variant);
}

export function loadFixtureRecords(
	scenario: string,
	variant = "default",
): ProbeFixtureRecord[] {
	const fixturePath = path.join(
		fixtureVariantDir(scenario, variant),
		"events.ndjson",
	);
	const lines = readFileSync(fixturePath, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	return lines.map((line) => JSON.parse(line) as ProbeFixtureRecord);
}

export function loadFixtureExpectedOutput(
	scenario: string,
	variant = "default",
): MastraDisplayStateSnapshot {
	const outputPath = path.join(
		fixtureVariantDir(scenario, variant),
		"output.json",
	);
	return JSON.parse(
		readFileSync(outputPath, "utf8"),
	) as MastraDisplayStateSnapshot;
}

export function toChatEnvelopes(
	records: ReadonlyArray<ProbeFixtureRecord>,
): MastraChatEventEnvelope[] {
	const envelopes: MastraChatEventEnvelope[] = [];
	for (const record of records) {
		if (record.channel !== "submit" && record.channel !== "harness") continue;
		if (!record.sessionId) continue;
		if (typeof record.sequenceHint !== "number") continue;
		envelopes.push({
			kind: record.channel,
			sessionId: record.sessionId,
			timestamp: record.timestamp,
			sequenceHint: record.sequenceHint,
			payload: record.payload,
		});
	}
	return envelopes;
}
