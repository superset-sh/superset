import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { dictationEngineFor } from "../dictationSession";
import { transcribeHostDictation } from "./transcribeHostDictation";

const target = { machineId: "mac", hostUrl: "http://mac", hostName: "My Mac" };
const queryKey = ["host-service", "superwhisper", "mac", "http://mac"];
const otherKey = ["host-service", "superwhisper", "other", "http://other"];
const audio = { uri: "file:///recording.m4a", durationMs: 1000 };

type Settings = { enabled: boolean; installed: boolean };
const ready: Settings = { enabled: true, installed: true };

test.each([
	{ kind: "DISABLED", refreshed: { enabled: false, installed: true } },
	{ kind: "UNAVAILABLE", refreshed: { enabled: true, installed: false } },
])("refreshes only the recording Mac's settings on $kind", async ({
	kind,
	refreshed: refreshedSettings,
}) => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity } },
	});
	client.setQueryData(queryKey, ready);
	client.setQueryData(otherKey, ready);
	let resolveSettings!: (value: Settings) => void;
	const pendingSettings = new Promise<Settings>((resolve) => {
		resolveSettings = resolve;
	});
	const observer = new QueryObserver(client, {
		queryKey,
		staleTime: Infinity,
		queryFn: () => pendingSettings,
	});
	let refreshed!: () => void;
	const finished = new Promise<void>((resolve) => {
		refreshed = resolve;
	});
	const unsubscribe = observer.subscribe((result) => {
		if (
			result.data?.enabled === refreshedSettings.enabled &&
			result.data?.installed === refreshedSettings.installed
		)
			refreshed();
	});
	const error = { data: { dictation: { kind } } };
	try {
		expect(dictationEngineFor(target, observer.getCurrentResult())).toBe(
			"file",
		);
		await expect(
			transcribeHostDictation(audio, target, {
				queryClient: client,
				readAudio: async () => "encoded",
				transcribe: async (hostUrl, encoded) => {
					expect(hostUrl).toBe("http://mac");
					expect(encoded).toBe("encoded");
					throw error;
				},
			}),
		).rejects.toBe(error);
		expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
		expect(dictationEngineFor(target, observer.getCurrentResult())).toBe(
			"file",
		);
		resolveSettings(refreshedSettings);
		await finished;
		expect(dictationEngineFor(target, observer.getCurrentResult())).toBe(
			"apple",
		);
		expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
	} finally {
		unsubscribe();
		client.clear();
	}
});

test("keeps known Superwhisper settings on transcription timeout", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { gcTime: Infinity } },
	});
	client.setQueryData(queryKey, ready);
	try {
		await expect(
			transcribeHostDictation(audio, target, {
				queryClient: client,
				readAudio: async () => "encoded",
				transcribe: async () => {
					throw { data: { dictation: { kind: "TIMEOUT" } } };
				},
			}),
		).rejects.toMatchObject({ data: { dictation: { kind: "TIMEOUT" } } });
		expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
		expect(client.getQueryData(queryKey)).toEqual(ready);
	} finally {
		client.clear();
	}
});
