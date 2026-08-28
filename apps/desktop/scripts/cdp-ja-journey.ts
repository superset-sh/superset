// Demo journey: switch the app to Japanese via Settings → Appearance →
// Language, then screenshot every dashboard surface converted in the i18n
// extraction batch. Temporary script for CDP verification; not shipped.
const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9250";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "6545";

const targets = (await (
	await fetch(`http://localhost:${PORT}/json`)
).json()) as { type: string; url: string; webSocketDebuggerUrl?: string }[];
const target = targets.find(
	(t) => t.type === "page" && t.url.includes(`localhost:${VITE_PORT}`),
);
if (!target) throw new Error("no renderer target");
const ws = new WebSocket(target.webSocketDebuggerUrl as string);
let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
ws.addEventListener("message", (ev) => {
	const m = JSON.parse(String(ev.data));
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)?.(m);
		pending.delete(m.id);
	}
});
const send = (method: string, params: object = {}): Promise<any> =>
	new Promise((r) => {
		pending.set(nextId, r);
		ws.send(JSON.stringify({ id: nextId++, method, params }));
	});
const evalJs = async (expression: string) =>
	(
		await send("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
		})
	).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickRect(rect: { x: number; y: number } | null | string) {
	if (!rect || typeof rect === "string") return false;
	for (const type of ["mousePressed", "mouseReleased"]) {
		await send("Input.dispatchMouseEvent", {
			type,
			x: rect.x,
			y: rect.y,
			button: "left",
			clickCount: 1,
		});
	}
	return true;
}
async function clickText(
	label: string,
	scope = "a,button,[role=button],[role=option],[role=menuitem]",
) {
	const rect = await evalJs(`(() => {
		const want = ${JSON.stringify(label)}.toLowerCase();
		const els = Array.from(document.querySelectorAll(${JSON.stringify(scope)}));
		const el = els.find(e => (e.getAttribute("aria-label") ?? "").toLowerCase() === want)
			?? els.find(e => (e.textContent ?? "").trim().toLowerCase() === want)
			?? els.find(e => (e.textContent ?? "").trim().toLowerCase().startsWith(want));
		if (!el) return null;
		el.scrollIntoView({block: "center"});
		const r = el.getBoundingClientRect();
		return {x: r.x + r.width/2, y: r.y + r.height/2};
	})()`);
	const ok = await clickRect(rect);
	if (!ok) console.log(`  !! clickText miss: ${label}`);
	return ok;
}
async function shot(name: string) {
	await sleep(900);
	const r = await send("Page.captureScreenshot", { format: "png" });
	await Bun.write(`/tmp/ja-${name}.png`, Buffer.from(r.result.data, "base64"));
	console.log("shot:", `/tmp/ja-${name}.png`);
}

await new Promise((r) => ws.addEventListener("open", r, { once: true }));
await send("Runtime.enable");
await send("Page.enable");

// Hook console errors for the whole journey.
await evalJs(`(() => {
	if (!window.__cdpErrs) {
		window.__cdpErrs = [];
		const orig = console.error;
		console.error = (...a) => { window.__cdpErrs.push(a.map(String).join(" ").slice(0, 200)); orig(...a); };
	}
	return true;
})()`);

// Wait for the authenticated shell (sidebar) to render.
for (let i = 0; i < 60; i++) {
	const ready = await evalJs(
		`!!document.querySelector("[data-workspaces-toolbar]") || (document.body?.innerText ?? "").includes("Workspaces")`,
	);
	if (ready) break;
	await sleep(2000);
}
const session = await evalJs(`(async () => {
	const { authClient } = await import("/lib/auth-client.ts");
	const s = await authClient.getSession({ fetchOptions: { throw: false } });
	return { org: s?.data?.session?.activeOrganizationId ?? null };
})()`);
console.log("session:", JSON.stringify(session));

// --- Switch to Japanese through the real UI ---
await clickText("Settings");
await sleep(1500);
await clickText("Appearance");
await sleep(1500);
const trigger = await evalJs(`(() => {
	const label = Array.from(document.querySelectorAll("div")).find(d => (d.textContent === "Language" || d.textContent === "言語") && d.className.includes("font-medium"));
	if (!label) return "no Language label";
	// The row is the flex container holding both the label block and the select.
	let row = label.parentElement;
	while (row && !row.querySelector("[role=combobox]")) row = row.parentElement;
	const btn = row?.querySelector("[role=combobox]");
	if (!btn) return "no select trigger";
	btn.scrollIntoView({block: "center"});
	const r = btn.getBoundingClientRect();
	return {x: r.x + r.width/2, y: r.y + r.height/2};
})()`);
console.log("language trigger:", JSON.stringify(trigger).slice(0, 80));
await clickRect(trigger);
await sleep(800);
await clickText("日本語", "[role=option]");
await sleep(1800);
const lang = await evalJs(`(async () => {
	const { electronTrpcClient } = await import("/lib/trpc-client.ts");
	return await electronTrpcClient.settings.getLanguage.query();
})()`);
console.log("persisted language:", JSON.stringify(lang));
await shot("00-settings-language");

// --- Back to dashboard, tour every converted surface ---
await clickText("Back");
await sleep(2000);

// Workspaces list + board (labels now Japanese).
await clickText("ワークスペース");
await sleep(1800);
await shot("01-workspaces-list");
await clickText("ボード");
await sleep(1200);
await shot("02-workspaces-board");
await clickText("リスト");
await sleep(600);

// Filter dropdown open (converted header).
await clickText("フィルター");
await sleep(800);
await shot("03-workspaces-filter");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
await sleep(400);

for (const [label, name] of [
	["タスク", "04-tasks"],
	["オートメーション", "05-automations"],
	["プルリクエスト", "06-pull-requests"],
	["ページ", "07-pages"],
	["プラグイン", "08-plugins"],
] as const) {
	await clickText(label);
	await sleep(2200);
	await shot(name);
}

// New-workspace modal.
await clickText("新規ワークスペース");
await sleep(1500);
await shot("09-new-workspace-modal");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });

const errs = await evalJs(`window.__cdpErrs ?? []`);
console.log("console.error count:", Array.isArray(errs) ? errs.length : errs);
if (Array.isArray(errs)) for (const e of errs.slice(0, 10)) console.log("  err:", e);
ws.close();
process.exit(0);
