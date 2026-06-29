/**
 * CDP smoke test: verifies the integrations data path end-to-end against a
 * running dev build, with no Electric/sync involvement.
 *
 * Usage:
 *   1. Launch the desktop app with remote debugging enabled (full local stack):
 *        RENDERER_REMOTE_DEBUG_PORT=9222 bun dev
 *   2. Run:
 *        bun run apps/desktop/scripts/cdp-smoke-integrations.ts
 *
 * It attaches to the renderer over CDP and runs the assertion *inside the page*
 * (Runtime.evaluate) using the app's own session cookie — this is far more
 * reliable than sniffing Network.* traffic, which misses cached React Query
 * responses and is suppressed while the window is backgrounded. See the "CDP"
 * section in apps/desktop/AGENTS.md.
 *
 * Asserts that integration.list returns 200, is a well-formed tRPC payload, and
 * carries NO `accessToken` / `refreshToken` (server-side column masking). An
 * empty connection list is a valid pass. Org-scoping itself is enforced and
 * unit-tested server-side (the masked rows don't expose organizationId), so this
 * harness does not re-assert it.
 *
 * Exits 0 on PASS, 1 on FAIL. Dependency-free (Bun WebSocket + fetch).
 */

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
// The dev app's backend origin (the renderer's NEXT_PUBLIC_API_URL).
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5881";

interface CdpTarget {
	type: string;
	url: string;
	title?: string;
	webSocketDebuggerUrl?: string;
}

// Runs in the renderer. Reads the active org from the session, then calls
// integration.list directly (bypassing the React Query cache) and reports
// whether the response is a valid, token-free tRPC payload.
const PROBE = `(async () => {
  const API = ${JSON.stringify(API)};
  const s = await fetch(API + "/api/auth/get-session", { credentials: "include" })
    .then(r => r.json()).catch(e => ({ err: String(e) }));
  const org = s && s.session && s.session.activeOrganizationId;
  if (!org) return JSON.stringify({ ok: false, where: "session", s });
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { organizationId: org } } }));
  const r = await fetch(API + "/api/trpc/integration.list?batch=1&input=" + input, { credentials: "include" });
  const body = await r.text();
  // A successful tRPC batch response is [{ result: { data: { json: [...] } } }].
  let rows = -1;
  try { const j = JSON.parse(body)?.[0]?.result?.data?.json; if (Array.isArray(j)) rows = j.length; } catch {}
  return JSON.stringify({
    ok: true,
    status: r.status,
    validPayload: rows >= 0,
    rows,
    leaksTokens: body.includes("accessToken") || body.includes("refreshToken"),
  });
})()`;

async function findRendererTarget(): Promise<CdpTarget> {
	const res = await fetch(`http://localhost:${PORT}/json`);
	const targets = (await res.json()) as CdpTarget[];
	// The main app renderer is an http(s) localhost SPA using hash routing
	// ("#/..."). Prefer that over any other page-like target (e.g. a webview),
	// which would run outside the app session and miss the auth cookie.
	const pages = targets.filter(
		(t) =>
			t.type === "page" &&
			t.webSocketDebuggerUrl &&
			/^https?:\/\/localhost(:\d+)?\//.test(t.url),
	);
	const page = pages.find((t) => t.url.includes("#/")) ?? pages[0];
	if (!page?.webSocketDebuggerUrl) {
		throw new Error(
			`No app renderer target on :${PORT}. Is the app running with RENDERER_REMOTE_DEBUG_PORT=${PORT}?`,
		);
	}
	return page;
}

function main() {
	findRendererTarget()
		.then((target) => {
			const ws = new WebSocket(target.webSocketDebuggerUrl as string);

			const fail = (msg: string) => {
				console.error(`❌ FAIL: ${msg}`);
				ws.close();
				process.exit(1);
			};

			const timer = setTimeout(() => fail("no result within 15s"), 15_000);

			ws.addEventListener("open", () => {
				console.log(`Attached to ${target.url}`);
				ws.send(
					JSON.stringify({
						id: 1,
						method: "Runtime.evaluate",
						params: {
							expression: PROBE,
							awaitPromise: true,
							returnByValue: true,
						},
					}),
				);
			});

			ws.addEventListener("message", (event) => {
				const msg = JSON.parse(event.data as string);
				if (msg.id !== 1) return;
				clearTimeout(timer);

				if (msg.result?.exceptionDetails) {
					return fail(
						`page threw: ${JSON.stringify(msg.result.exceptionDetails).slice(0, 300)}`,
					);
				}
				const out = JSON.parse(msg.result?.result?.value ?? "{}");
				if (!out.ok)
					return fail(
						`could not reach integration.list (${out.where ?? "unknown"})`,
					);

				console.log(`  status: ${out.status}`);
				console.log(`  rows: ${out.rows}`);
				console.log(`  leaks tokens: ${out.leaksTokens}`);

				if (out.status !== 200)
					return fail(`integration.list returned ${out.status}`);
				if (!out.validPayload)
					return fail("integration.list did not return a tRPC data array");
				if (out.leaksTokens)
					return fail("integration.list response contains OAuth token fields");

				console.log(
					`✅ PASS: integration.list is masked and served via tRPC (${out.rows} row(s))`,
				);
				ws.close();
				process.exit(0);
			});

			ws.addEventListener("error", (e) =>
				fail(`websocket error: ${(e as ErrorEvent).message ?? e}`),
			);
		})
		.catch((err) => {
			console.error(`❌ FAIL: ${err.message}`);
			process.exit(1);
		});
}

main();
