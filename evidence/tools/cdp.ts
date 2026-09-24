/**
 * Minimal Chrome DevTools Protocol driver for the GHSA-2cp5-f6gg-w5fp drive:
 * two independent browser sessions (separate profiles, separate cookie jars),
 * navigation with the redirect chain recorded, and screenshots.
 *
 * Test-only. `MAP api.notion.com 127.0.0.1` sends the provider leg at the
 * local stand-in server so no real provider is ever contacted.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME = "/usr/local/bin/google-chrome";

/** The fields of a CDP `Network.Cookie` this drive reads. */
export type Cookie = {
	name: string;
	value: string;
	path: string;
	httpOnly: boolean;
	sameSite?: string;
};

export type Browser = {
	name: string;
	port: number;
	send: <T = Record<string, unknown>>(
		method: string,
		params?: unknown,
	) => Promise<T>;
	redirects: string[];
	close: () => void;
};

async function waitForJson(port: number): Promise<string> {
	for (let i = 0; i < 120; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (res.ok) return (await res.json()).webSocketDebuggerUrl as string;
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`chrome on ${port} never answered`);
}

export async function launch(name: string, port: number): Promise<Browser> {
	const dir = `/tmp/cdp-profile-${name}`;
	mkdirSync(dir, { recursive: true });
	const proc = spawn(
		CHROME,
		[
			"--headless=new",
			"--no-sandbox",
			"--disable-gpu",
			"--disable-dev-shm-usage",
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${dir}`,
			"--host-resolver-rules=MAP api.notion.com 127.0.0.1",
			"--ignore-certificate-errors",
			"--window-size=1280,900",
			"about:blank",
		],
		{ stdio: ["ignore", "ignore", "ignore"], detached: true },
	);

	const browserWs = await waitForJson(port);
	const targets = (await (
		await fetch(`http://127.0.0.1:${port}/json/list`)
	).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
	const page = targets.find((t) => t.type === "page") ?? targets[0];
	if (!page) throw new Error(`chrome on ${port} exposed no target`);
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((r) => ws.addEventListener("open", r, { once: true }));

	type Reply = { id?: number; error?: { message: string }; result?: unknown };
	let id = 0;
	const pending = new Map<number, (v: Reply) => void>();
	const redirects: string[] = [];
	ws.addEventListener("message", (event) => {
		const msg = JSON.parse(String(event.data)) as Reply & {
			method?: string;
			params?: { request?: { url: string } };
		};
		if (msg.id && pending.has(msg.id)) {
			pending.get(msg.id)?.(msg);
			pending.delete(msg.id);
			return;
		}
		if (msg.method === "Network.requestWillBeSent" && msg.params?.request) {
			redirects.push(msg.params.request.url);
		}
	});

	const send = <T = Record<string, unknown>>(
		method: string,
		params: unknown = {},
	) =>
		new Promise<T>((resolve, reject) => {
			const mid = ++id;
			pending.set(mid, (msg) =>
				msg.error
					? reject(new Error(`${method}: ${msg.error.message}`))
					: resolve(msg.result as T),
			);
			ws.send(JSON.stringify({ id: mid, method, params }));
		});

	await send("Page.enable");
	await send("Runtime.enable");
	await send("Network.enable");
	void browserWs;

	return {
		name,
		port,
		send,
		redirects,
		close: () => {
			try {
				ws.close();
			} catch {}
			try {
				if (proc.pid) process.kill(-proc.pid, "SIGKILL");
			} catch {}
		},
	};
}

export async function goto(b: Browser, url: string): Promise<string> {
	b.redirects.length = 0;
	await b.send("Page.navigate", { url });
	await new Promise((r) => setTimeout(r, 2500));
	return evaluate<string>(b, "location.href");
}

export async function evaluate<T>(b: Browser, expression: string): Promise<T> {
	const { result, exceptionDetails } = await b.send<{
		result: { value: T };
		exceptionDetails?: unknown;
	}>("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
	return result.value;
}

export async function screenshot(b: Browser, path: string): Promise<void> {
	const { data } = await b.send<{ data: string }>("Page.captureScreenshot", {
		format: "png",
	});
	writeFileSync(path, Buffer.from(data, "base64"));
}
