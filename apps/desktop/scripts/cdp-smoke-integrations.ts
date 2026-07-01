/**
 * Smoke test for the integrations data path against a running dev build.
 *
 *   RENDERER_REMOTE_DEBUG_PORT=9222 bun dev      # then, signed in:
 *   bun run apps/desktop/scripts/cdp-smoke-integrations.ts
 *
 * Asserts inside the page (Runtime.evaluate + session cookie) that
 * integration.list returns 200, a well-formed tRPC array, and no
 * accessToken/refreshToken. Empty list passes. In-page eval beats Network.*
 * sniffing, which misses cached React Query responses — see AGENTS.md.
 *
 * Exits 0 on PASS, 1 on FAIL. Dependency-free (Bun WebSocket + fetch).
 */

const PORT = process.env.RENDERER_REMOTE_DEBUG_PORT ?? "9222";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5881";

interface CdpTarget {
	type: string;
	url: string;
	title?: string;
	webSocketDebuggerUrl?: string;
}

// Runs in the renderer: reads the active org, then calls integration.list
// directly (no React Query cache).
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
	// Prefer the app renderer (localhost SPA, hash route) over a webview/other
	// page that would miss the session cookie.
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
