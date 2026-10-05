/**
 * Record the real Teleport journey in the running dev app as a screencast.
 *
 * Uses CDP `Page.startScreencast` on the actual Electron renderer — every
 * frame is what the app painted — while real mouse input drives the flow:
 * right-click the workspace row → Teleport… → pick a host → Review → plan.
 *
 *   ROW_X=70 ROW_Y=454 bun run scripts/cdp-teleport-record.ts
 *
 * Frames land in /tmp/teleport-rec/frame-<ms>.jpg with capture times in
 * frames.json, for ffmpeg to assemble with true timing.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "3005";
const ROW_X = Number(process.env.ROW_X ?? "70");
const ROW_Y = Number(process.env.ROW_Y ?? "454");
const OUT = "/tmp/teleport-rec";
mkdirSync(OUT, { recursive: true });

const targets: Array<{
	type: string;
	url: string;
	webSocketDebuggerUrl?: string;
}> = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const page = targets.find(
	(t) => t.type === "page" && t.url.includes(`localhost:${VITE_PORT}`),
);
if (!page?.webSocketDebuggerUrl) throw new Error("no matching renderer");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => {
	socket.onopen = resolve;
});
let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
const frames: Array<{ file: string; t: number }> = [];
const t0 = Date.now();

socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data));
	if (message.method === "Page.screencastFrame") {
		const t = Date.now() - t0;
		const file = `${OUT}/frame-${String(t).padStart(6, "0")}.jpg`;
		writeFileSync(file, Buffer.from(message.params.data, "base64"));
		frames.push({ file, t });
		send("Page.screencastFrameAck", { sessionId: message.params.sessionId });
		return;
	}
	pending.get(message.id)?.(message);
	pending.delete(message.id);
};
function send(method: string, params: unknown = {}): Promise<any> {
	const id = nextId++;
	socket.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve) => pending.set(id, resolve as never));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression: string) {
	const r = await send("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	return r.result?.result?.value;
}

type Point = { x: number; y: number };

/** Glide the pointer in, pause so hover state lands, then press and release. */
async function click(at: Point, button: "left" | "right") {
	await send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: at.x - 30,
		y: at.y,
	});
	await wait(120);
	await send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: at.x,
		y: at.y,
	});
	await wait(260);
	await send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: at.x,
		y: at.y,
		button,
		buttons: button === "left" ? 1 : 2,
		clickCount: 1,
	});
	await wait(70);
	await send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x: at.x,
		y: at.y,
		button,
		buttons: 0,
		clickCount: 1,
	});
}

/** Centre of the first element matching `selector` whose text includes `needle`. */
async function find(selector: string, needle: string): Promise<Point | null> {
	return evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => (e.textContent||'').includes(${JSON.stringify(needle)}));
    if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
  })()`);
}
async function waitFor(
	selector: string,
	needle: string,
	ms = 15000,
): Promise<Point | null> {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		const at = await find(selector, needle);
		if (at) return at;
		await wait(200);
	}
	return null;
}
const dialogTexts = () =>
	evaluate(`(() => { const d = document.querySelector('[data-slot=dialog-content]'); if (!d) return null;
    return [...d.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent||'').trim()).map(e => e.textContent.trim().slice(0, 48)).slice(0, 24); })()`);

await send("Page.enable");
await send("Runtime.enable");
await send("Page.startScreencast", {
	format: "jpeg",
	quality: 85,
	maxWidth: 1920,
	maxHeight: 1108,
	everyNthFrame: 1,
});
console.log("recording…");
await wait(1500);

console.log("1. right-click the workspace row");
await click({ x: ROW_X, y: ROW_Y }, "right");
const item = await waitFor("[role=menuitem]", "Teleport", 6000);
console.log("   Teleport… item:", JSON.stringify(item));
await wait(1600);

if (item) {
	console.log("2. click Teleport…");
	await click(item, "left");
	const opened = await waitFor("[data-slot=dialog-content]", "Teleport", 8000);
	console.log(
		"   dialog:",
		opened ? "open" : "missing",
		JSON.stringify(await dialogTexts()),
	);
	await wait(1800);

	console.log("3. pick a destination");
	const host = await waitFor(
		"[data-slot=dialog-content] button",
		"beelink",
		5000,
	);
	console.log("   host row:", JSON.stringify(host));
	if (host) {
		await click(host, "left");
		await wait(1400);
		const review = await waitFor(
			"[data-slot=dialog-content] button",
			"Review",
			4000,
		);
		console.log("4. click Review:", JSON.stringify(review));
		if (review) {
			await click(review, "left");
			// The plan is loaded from the real host: branch, counts, refusals.
			const plan =
				(await waitFor("[data-slot=dialog-content]", "Branch", 25000)) ??
				(await waitFor(
					"[data-slot=dialog-content]",
					"already checked out",
					500,
				)) ??
				(await waitFor("[data-slot=dialog-content]", "has commits", 500));
			console.log(
				"5. plan:",
				plan ? "rendered" : "not rendered",
				JSON.stringify(await dialogTexts()),
			);
			await wait(4500);
		}
	}
}

await send("Page.stopScreencast");
writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
console.log(
	`frames: ${frames.length}, duration ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
socket.close();
