// Test-only daemon entrypoint. Fresh startup delegates to the real daemon,
// while the handoff child deliberately NAKs before reading/adopting the
// snapshot. Spawning that child is enough to clear O_NONBLOCK on the
// predecessor's shared PTY open-file descriptions.

if (process.argv.includes("--handoff")) {
	if (typeof process.send !== "function") {
		throw new Error("handoff NAK fixture requires an IPC channel");
	}
	process.send(
		{
			type: "upgrade-nak",
			reason: "intentional test NAK before adoptSnapshot",
		},
		() => process.exit(17),
	);
} else {
	await import("../../src/main.ts");
}
