import { expect, test } from "bun:test";
import {
	createDictationSession,
	createDictationSessionRegistry,
	dictationScopeKey,
} from "./dictationSession";

const target = { machineId: "mac", hostUrl: "http://mac", hostName: "My Mac" };
const audio = { uri: "file:///recording.m4a", durationMs: 1000 };

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

test.each([
	["other-account", "org"],
	["account", "other-org"],
	[null, null],
])("invalidates pending results when account/org becomes %s/%s", async (account, organization) => {
	const registry = createDictationSessionRegistry();
	registry.setScope(dictationScopeKey("account", "org"));
	const pending = deferred<string>();
	const appended: string[] = [];
	const removed: string[] = [];
	const dependencies = {
		transcribe: () => pending.promise,
		append: (text: string) => {
			appended.push(text);
		},
		remove: (uri: string) => removed.push(uri),
	};
	const original = registry.get("home", () =>
		createDictationSession(dependencies),
	);
	original.session.accept(audio, target);
	registry.setScope(dictationScopeKey(account, organization));
	const next = registry.get("home", () => createDictationSession(dependencies));
	expect(
		registry.get("home", () => createDictationSession(dependencies)),
	).toEqual(next);
	expect(next.key).not.toBe(original.key);
	expect(next.session).not.toBe(original.session);
	expect(original.session.getSnapshot().status).toBe("idle");
	expect(removed).toEqual([audio.uri]);
	pending.resolve("old result");
	await pending.promise;
	expect(appended).toEqual([]);
	original.session.accept(audio, target);
	expect(original.session.getSnapshot().status).toBe("idle");
});
