/**
 * Record a teleport that nobody waits for: start it, send it to the
 * background, keep editing in the source, and let the toast bring you to
 * the destination, where the late edit has arrived.
 *
 *   ROW_TEXT="teleport source" bun run scripts/cdp-teleport-record-background.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "3005";
const ROW_TEXT = process.env.ROW_TEXT ?? "teleport source";
const OUT = process.env.OUT_DIR ?? "/tmp/teleport-background-rec";
const LATE_LINE = `late change at ${new Date().toISOString().slice(11, 19)}`;
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
const consoleErrors: string[] = [];
socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data));
	if (message.method === "Runtime.exceptionThrown") {
		consoleErrors.push(
			`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`.slice(
				0,
				300,
			),
		);
	}
	if (
		message.method === "Runtime.consoleAPICalled" &&
		message.params.type === "error"
	) {
		consoleErrors.push(
			`console.error: ${message.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description ?? "").join(" ")}`.slice(
				0,
				300,
			),
		);
	}
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
// biome-ignore lint/suspicious/noExplicitAny: raw CDP envelopes
function send(method: string, params: unknown = {}): Promise<any> {
	const id = nextId++;
	socket.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve) => pending.set(id, resolve as never));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const since = () => `t+${((Date.now() - t0) / 1000).toFixed(1)}s`;
async function evaluate(expression: string) {
	const r = await send("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	return r.result?.result?.value;
}
type Point = { x: number; y: number };
async function click(at: Point, button: "left" | "right" = "left") {
	await send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: at.x,
		y: at.y,
	});
	await wait(200);
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
async function typeText(text: string) {
	await send("Input.insertText", { text });
	await wait(400);
}
async function openTerminalPane() {
	for (const type of ["keyDown", "keyUp"] as const) {
		await send("Input.dispatchKeyEvent", {
			type,
			key: "T",
			code: "KeyT",
			windowsVirtualKeyCode: 84,
			modifiers: 10,
		});
	}
	await wait(3500);
}
async function pressEnter() {
	await send("Input.dispatchKeyEvent", {
		type: "keyDown",
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		text: "\r",
		unmodifiedText: "\r",
	});
	await send("Input.dispatchKeyEvent", {
		type: "keyUp",
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
	});
}
/** Centre of the first element matching `selector` whose text contains `needle`. */
async function find(
	selector: string,
	needle: string,
	predicate = "true",
): Promise<Point | null> {
	return evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => {
      const r = e.getBoundingClientRect();
      return (e.textContent||'').includes(${JSON.stringify(needle)}) && r.width > 0 && (${predicate});
    });
    if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
  })()`);
}
async function waitFor(
	selector: string,
	needle: string,
	ms: number,
	predicate = "true",
): Promise<Point | null> {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		const at = await find(selector, needle, predicate);
		if (at) return at;
		await wait(400);
	}
	return null;
}
async function paneTabs(): Promise<Array<Point & { label: string }>> {
	return evaluate(
		`(() => [...document.querySelectorAll('[data-slot=context-menu-trigger] [data-slot=tooltip-trigger] > span')]
      .map(e => { const r = e.getBoundingClientRect(); return { label: (e.textContent||'').trim(), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), w: r.width }; })
      .filter(t => t.y < 50 && t.x > 280 && t.w > 0 && t.label.length > 0)
      .sort((a, b) => a.x - b.x))()`,
	);
}
async function snapshot(name: string) {
	const s = await send("Page.captureScreenshot", { format: "png" });
	if (s.result?.data)
		writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, "base64"));
}
const stepsDone = (): Promise<number> =>
	evaluate(
		"document.querySelectorAll('[data-slot=dialog-content] svg.lucide-check').length",
	);

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

console.log("0. a shell pane in the source, to keep working in");
const existingShell = (await paneTabs()).find((tab) => tab.label.includes("@"));
if (existingShell) await click(existingShell);
else await openTerminalPane();
await wait(1000);
await snapshot("00-source");

console.log("1. right-click the workspace row");
const row = await find(
	"span, div",
	ROW_TEXT,
	`r.x < 280 && e.children.length === 0 && (e.textContent||'').trim() === ${JSON.stringify(ROW_TEXT)}`,
);
if (!row) throw new Error(`no sidebar row named ${ROW_TEXT}`);
await click(row, "right");
const item = await waitFor("[role=menuitem]", "Teleport", 6000);
if (!item) throw new Error("Teleport… not in the context menu");
await wait(1000);
console.log("2. Teleport…");
await click(item);
await waitFor("[data-slot=dialog-content]", "Teleport", 8000);
await wait(1200);

console.log("3. Cloud → Review → Teleport");
const cloud = await waitFor("[data-slot=dialog-content] button", "Cloud", 6000);
if (!cloud) throw new Error("Cloud is not offered");
await click(cloud);
await wait(800);
const review = await waitFor(
	"[data-slot=dialog-content] button",
	"Review",
	4000,
);
if (!review) throw new Error("no Review button");
await click(review);
await waitFor("[data-slot=dialog-content]", "Branch", 30000);
await wait(2500);
const go = await waitFor("[data-slot=dialog-content] button", "Teleport", 4000);
if (!go) throw new Error("no Teleport button");
await click(go);
const started = Date.now();

console.log("4. let the capture finish, then send the run to the background");
while (Date.now() - started < 60_000 && (await stepsDone()) < 2)
	await wait(300);
console.log(
	`   ${since()} capture done after ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
await wait(1200);
const background = await find(
	"[data-slot=dialog-content] button",
	"Run in background",
);
if (!background) throw new Error("no Run in background button");
await click(background);
await wait(1500);
await snapshot("01-background");
const spinner = await evaluate(
	"!!document.querySelector('aside svg.animate-spin, nav svg.animate-spin, [aria-label^=\"Teleporting\"]')",
);
console.log("   sidebar shows the move running:", spinner ? "YES" : "no");

console.log("5. keep working in the source: append a line in the shell pane");
await click({ x: 900, y: 500 });
await wait(300);
await typeText(
	`echo "${LATE_LINE}" >> TELEPORT_HANDOFF.md && tail -1 TELEPORT_HANDOFF.md`,
);
await pressEnter();
await wait(2000);
await snapshot("02-late-edit");
console.log(`   ${since()} appended: ${LATE_LINE}`);

console.log("6. wait for the toast");
const toastOpen = await waitFor(
	"[data-sonner-toast] button",
	"Open on",
	10 * 60_000,
);
console.log(`   ${since()} toast:`, toastOpen ? "YES" : "no");
await wait(2500);
await snapshot("03-toast");
if (!toastOpen) throw new Error("no completion toast");
const sourceHash: string = await evaluate("location.hash");
// The toast slides in; take the button's place again once it has settled,
// and try once more if the first click did not take.
let navigated = false;
for (let attempt = 0; attempt < 3 && !navigated; attempt++) {
	const settled = await find("[data-sonner-toast] button", "Open on");
	if (!settled) break;
	await click(settled);
	const navDeadline = Date.now() + 8_000;
	while (Date.now() < navDeadline) {
		const hash: string = await evaluate("location.hash");
		if (/\/v2-workspace\//.test(hash) && hash !== sourceHash) {
			navigated = true;
			break;
		}
		await wait(300);
	}
}
console.log(
	`   ${since()} route:`,
	await evaluate("location.hash"),
	navigated ? "(destination)" : "(still on the source)",
);
if (!navigated) throw new Error("Open on Cloud did not open the destination");

console.log(
	"7. destination: show the arrival tab, then prove the late line arrived",
);
let tabs: Array<Point & { label: string }> = [];
const tabDeadline = Date.now() + 3 * 60_000;
while (Date.now() < tabDeadline && tabs.length === 0) {
	tabs = await paneTabs();
	if (tabs.length === 0) await wait(1000);
}
await wait(4000);
console.log("   tabs:", tabs.map((t) => t.label).join(" | "));
if (tabs[0]) await click(tabs[0]);
await wait(1000);
await click({ x: 900, y: 500 });
await wait(400);
await typeText(
	"tail -1 TELEPORT_HANDOFF.md; git status --porcelain=v1 --untracked-files=all | wc -l",
);
await pressEnter();
const proofDeadline = Date.now() + 30_000;
let proof: string | null = null;
while (Date.now() < proofDeadline && !proof) {
	proof = await evaluate(
		`(() => { const i = document.body.innerText; const line = i.split('\\n').find(l => l.trim() === ${JSON.stringify(LATE_LINE)}); return line ?? null; })()`,
	);
	if (!proof) await wait(500);
}
console.log(
	`   ${since()} late line visible on the destination:`,
	proof ? "YES" : "no",
);
await wait(3000);
await snapshot("04-destination");
await wait(5000);

await send("Page.stopScreencast");
for (const line of consoleErrors
	.filter((l) => !/ERR_CONNECTION_REFUSED|localhost:3013|WebGL/.test(l))
	.slice(-8)) {
	console.log("   renderer:", line);
}
writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
console.log(
	`frames: ${frames.length}, duration ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
socket.close();
