/**
 * Minimal CDP driver for poking the running dev renderer: real mouse input,
 * real typing, screenshots. Used to walk the Teleport journey the way a
 * person does rather than by calling app internals.
 *
 *   bun run scripts/cdp-drive.ts click 257 398 shot=projects
 *   bun run scripts/cdp-drive.ts type "/tmp/repo" shot=typed
 *   bun run scripts/cdp-drive.ts rclick 140 300 shot=menu
 *   bun run scripts/cdp-drive.ts text "Teleport"
 */
const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "3005";

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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression: string) {
	const response = await send("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	if (response.result?.exceptionDetails) {
		return `EXCEPTION: ${response.result.exceptionDetails.exception?.description}`;
	}
	return response.result?.result?.value;
}

async function shot(name: string) {
	const s = await send("Page.captureScreenshot", { format: "png" });
	if (s.result?.data) {
		await Bun.write(
			`/tmp/teleport-${name}.png`,
			Buffer.from(s.result.data, "base64"),
		);
		console.log(`screenshot → /tmp/teleport-${name}.png`);
	}
}

async function mouse(x: number, y: number, button: "left" | "right") {
	for (const type of ["mousePressed", "mouseReleased"] as const) {
		await send("Input.dispatchMouseEvent", {
			type,
			x,
			y,
			button,
			clickCount: 1,
			buttons: button === "left" ? 1 : 2,
		});
	}
}

await send("Page.enable");
await send("Runtime.enable");

const args = process.argv.slice(2);
const shotArg = args.find((a) => a.startsWith("shot="))?.slice(5);
const command = args[0];

if (command === "click" || command === "rclick") {
	await mouse(
		Number(args[1]),
		Number(args[2]),
		command === "click" ? "left" : "right",
	);
	await wait(900);
} else if (command === "type") {
	for (const char of args[1] ?? "") {
		await send("Input.dispatchKeyEvent", { type: "char", text: char });
	}
	await wait(400);
} else if (command === "key") {
	await send("Input.dispatchKeyEvent", {
		type: "keyDown",
		key: args[1],
		code: args[1],
	});
	await send("Input.dispatchKeyEvent", {
		type: "keyUp",
		key: args[1],
		code: args[1],
	});
	await wait(700);
} else if (command === "text") {
	const needle = args[1] ?? "";
	console.log(
		"found:",
		await evaluate(
			`[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent?.includes(${JSON.stringify(needle)})).map(e=>{const r=e.getBoundingClientRect();return e.textContent.trim().slice(0,40)+' @'+Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2)}).slice(0,10).join(' | ')`,
		),
	);
} else if (command === "eval") {
	console.log(await evaluate(args[1] ?? "null"));
}

if (shotArg) await shot(shotArg);
socket.close();
