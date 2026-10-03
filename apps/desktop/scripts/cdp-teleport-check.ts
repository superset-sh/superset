/**
 * Drive the running dev app over CDP to check the Teleport entry point and
 * dialog against the real renderer.
 *
 *   RENDERER_REMOTE_DEBUG_PORT=9222 bun run scripts/cdp-teleport-check.ts
 */

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "3005";

interface Target {
	type: string;
	url: string;
	webSocketDebuggerUrl?: string;
}

const targets: Target[] = await fetch(
	`http://127.0.0.1:${PORT}/json/list`,
).then((response) => response.json());

const page = targets.find(
	(target) =>
		target.type === "page" && target.url.includes(`localhost:${VITE_PORT}`),
);
if (!page?.webSocketDebuggerUrl) {
	throw new Error(
		`No renderer on :${PORT} serving localhost:${VITE_PORT}. Targets: ${targets
			.map((target) => `${target.type} ${target.url}`)
			.join(", ")}`,
	);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => {
	socket.onopen = resolve;
});

let nextId = 1;
const pending = new Map<number, (value: unknown) => void>();
socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data));
	pending.get(message.id)?.(message);
	pending.delete(message.id);
};

function send(method: string, params: unknown = {}): Promise<any> {
	const id = nextId++;
	socket.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve) => pending.set(id, resolve as never));
}

async function evaluate(expression: string): Promise<unknown> {
	const response = await send("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	if (response.result?.exceptionDetails) {
		throw new Error(
			response.result.exceptionDetails.exception?.description ??
				"evaluate failed",
		);
	}
	return response.result?.result?.value;
}

async function screenshot(name: string): Promise<void> {
	const shot = await send("Page.captureScreenshot", { format: "png" });
	const data = shot.result?.data;
	if (!data) throw new Error("no screenshot data");
	await Bun.write(`/tmp/teleport-${name}.png`, Buffer.from(data, "base64"));
	console.log(`  screenshot → /tmp/teleport-${name}.png`);
}

await send("Page.enable");
await send("Runtime.enable");

console.log("route:", await evaluate("location.hash"));
console.log(
	"signed in:",
	await evaluate(`(async () => {
    const res = await fetch("${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/auth/get-session", { credentials: "include" });
    const body = await res.json().catch(() => null);
    return body?.session ? "yes org=" + (body.session.activeOrganizationId ?? "none") : "no";
  })()`),
);

// The sidebar rows are the entry point; find one and open its context menu.
const rowInfo = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('[data-workspace-id], [data-testid*="workspace"]')];
  return { count: rows.length, first: rows[0]?.textContent?.slice(0, 60) ?? null };
})()`);
console.log("sidebar workspace rows:", JSON.stringify(rowInfo));

await screenshot("01-app");

// Does the teleport module load in the real renderer?
console.log(
	"teleport module:",
	await evaluate(`(async () => {
    try {
      const m = await import("/@fs/workspace/packages/shared/src/teleport.ts");
      return "steps=" + m.TELEPORT_STEPS.length;
    } catch (error) { return "import failed: " + error.message; }
  })()`),
);

socket.close();
