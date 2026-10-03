/**
 * Record a real machine→cloud teleport in the running dev app as one
 * continuous screencast, ending on the destination sandbox's own terminal
 * showing the restore marker — the validation is in the frames.
 *
 *   ROW_X=70 ROW_Y=454 bun run scripts/cdp-teleport-record-cloud.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "3005";
const ROW_X = Number(process.env.ROW_X ?? "70");
const ROW_Y = Number(process.env.ROW_Y ?? "454");
const OUT = process.env.OUT_DIR ?? "/tmp/teleport-cloud-rec";
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
		const file = `${OUT}/frame-${String(t).padStart(7, "0")}.jpg`;
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
	ms: number,
): Promise<Point | null> {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		const at = await find(selector, needle);
		if (at) return at;
		await wait(400);
	}
	return null;
}
const dialogText = () =>
	evaluate(
		`(() => { const d = document.querySelector('[data-slot=dialog-content]'); return d ? d.innerText : null; })()`,
	);
async function snapshot(name: string) {
	const s = await send("Page.captureScreenshot", { format: "png" });
	if (s.result?.data)
		writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, "base64"));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.startScreencast", {
	format: "jpeg",
	quality: 80,
	maxWidth: 1920,
	maxHeight: 1108,
	everyNthFrame: 2,
});
console.log("recording…");
await wait(1500);

console.log("1. right-click the workspace row");
await click({ x: ROW_X, y: ROW_Y }, "right");
const item = await waitFor("[role=menuitem]", "Teleport", 6000);
if (!item) throw new Error("Teleport… not in the context menu");
await wait(1200);

console.log("2. Teleport…");
await click(item, "left");
await waitFor("[data-slot=dialog-content]", "Teleport", 8000);
await wait(1500);

console.log("3. choose Cloud");
const cloud = await waitFor("[data-slot=dialog-content] button", "Cloud", 6000);
if (!cloud) throw new Error("Cloud is not offered in the picker");
await click(cloud, "left");
await wait(1000);
const review = await waitFor(
	"[data-slot=dialog-content] button",
	"Review",
	4000,
);
if (!review) throw new Error("no Review button");
await click(review, "left");

console.log("4. plan");
const planned = await waitFor("[data-slot=dialog-content]", "Branch", 30000);
console.log(
	"   plan:",
	planned ? "rendered" : "missing",
	JSON.stringify((await dialogText())?.slice(0, 300)),
);
await snapshot("01-plan");
await wait(3000);

console.log("5. Teleport");
const go = await waitFor("[data-slot=dialog-content] button", "Teleport", 4000);
if (!go) throw new Error("no Teleport button");
await click(go, "left");

// The run is long (a sandbox clones the repository). Keep the screencast
// going and log the step list as it advances.
const started = Date.now();
let last = "";
let openThere: Point | null = null;
while (Date.now() - started < 15 * 60_000) {
	const text = (await dialogText()) ?? "";
	const steps = text
		.split("\n")
		.filter((l) =>
			/Asking|Capturing|Creating|Restoring|Running|Rebuilding|Stopping|Starting|failed/i.test(
				l,
			),
		)
		.join(" | ");
	if (steps !== last) {
		console.log(
			`   t+${Math.round((Date.now() - started) / 1000)}s ${steps.slice(0, 200)}`,
		);
		last = steps;
	}
	if (/failed/i.test(text)) {
		await snapshot("02-failed");
		console.log("   FAILED:", text.slice(0, 400));
		break;
	}
	openThere = await evaluate(`(() => {
    const b = [...document.querySelectorAll('[data-slot=dialog-content] button')].find(e => /Open on/.test(e.textContent||''));
    if (!b || b.disabled) return null; const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
  })()`);
	if (openThere) break;
	await wait(3000);
}
await snapshot("02-steps-done");

if (openThere) {
	console.log("6. Open on Cloud");
	await wait(2000);
	await click(openThere, "left");
	// The destination page: wait for its terminal to show the marker.
	const marker = await waitFor("body", "TELEPORT_RESTORED", 4 * 60_000);
	console.log("7. destination terminal shows marker:", marker ? "YES" : "no");
	const line = await evaluate(
		`(() => { const m = document.body.innerText.match(/TELEPORT_RESTORED [^\\n]*/); return m ? m[0] : null; })()`,
	);
	console.log("   ", line);
	await snapshot("03-destination");
	await wait(6000);
}

await send("Page.stopScreencast");
writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
console.log(
	`frames: ${frames.length}, duration ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
socket.close();
