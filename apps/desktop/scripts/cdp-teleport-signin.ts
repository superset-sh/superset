/**
 * Sign the running dev renderer into the local stack, then report whether a
 * session with an active organization exists. Credentials are read from
 * `@superset/shared/dev-credentials` and never printed.
 */
import { DEV_EMAIL, DEV_PASSWORD } from "@superset/shared/dev-credentials";

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
const VITE_PORT = process.env.DESKTOP_VITE_PORT ?? "3005";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(API)) {
	throw new Error(`Refusing to send dev credentials to ${API}`);
}

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
async function evaluate(expression: string) {
	const response = await send("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	return response.result?.result?.value;
}

await send("Runtime.enable");

// Status only — never the token or the response body.
console.log(
	"sign-in status:",
	await evaluate(`(async () => {
    const res = await fetch("${API}/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: ${JSON.stringify(DEV_EMAIL)}, password: ${JSON.stringify(DEV_PASSWORD)} }),
    });
    return res.status;
  })()`),
);

console.log(
	"session:",
	await evaluate(`(async () => {
    const res = await fetch("${API}/api/auth/get-session", { credentials: "include" });
    const body = await res.json().catch(() => null);
    return body?.session
      ? "ok org=" + (body.session.activeOrganizationId ?? "none")
      : "none (" + res.status + ")";
  })()`),
);

await evaluate("location.reload()");
socket.close();
