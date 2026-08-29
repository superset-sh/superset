// Requests every route of a deployed Next app two ways and fails on any 5xx.
//
// The second way is an RSC request, the shape a client-side navigation uses.
//
// Scope, so this is not mistaken for more than it is: we send `RSC: 1` but no
// `Next-Router-State-Tree`. Without that header Next renders the full tree
// including the root layout, so this does NOT reproduce the segment pruning
// that caused MARKETING-67/68/69. Fabricating a tree is not the answer — a
// hand-built one 500s against a healthy deploy, and its shape is coupled to
// the Next version, so it fails closed for the wrong reason. Layout pruning
// is covered statically instead, by packages/i18n/test/rsc-seeding.test.ts.
//
// What this does catch is everything that only breaks once deployed: a
// missing environment variable, a failing data fetch, a route that throws
// under the serverless runtime. Today CI deploys and never requests a page.
//
// Usage: bun scripts/smoke-routes.ts <base-url> <route>...
const [baseArg, ...routes] = process.argv.slice(2);
if (!baseArg || routes.length === 0) {
	console.error("usage: bun scripts/smoke-routes.ts <base-url> <route>...");
	process.exit(2);
}
const base = baseArg.replace(/\/$/, "");
// Vercel Deployment Protection walls previews behind SSO, which this script
// would otherwise sail past — a redirect is a legitimate pass for auth-gated
// routes, so an SSO wall makes every check vacuous. When the bypass secret is
// present, send it; when protection is on and no secret is available, an SSO
// redirect at the root fails loudly instead of pretending to test.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const bypassHeaders: Record<string, string> = bypassSecret
	? { "x-vercel-protection-bypass": bypassSecret }
	: {};
// --localized: also verify each route serves Japanese to a ja Accept-Language
// request. Only meaningful for apps whose pages are translated server-side.
const localized = routes.includes("--localized");
if (localized) routes.splice(routes.indexOf("--localized"), 1);

type Failure = { route: string; mode: string; detail: string };
const failures: Failure[] = [];

// The alias is assigned seconds before this runs and can take a moment to
// resolve. Without this the gate fails intermittently on a healthy deploy,
// and a flaky gate is one somebody turns off.
async function waitForReady(timeoutMs = 90_000) {
	const deadline = Date.now() + timeoutMs;
	let lastDetail = "no attempt made";
	while (Date.now() < deadline) {
		try {
			const res = await fetch(base, {
				headers: bypassHeaders,
				redirect: "manual",
			});
			// A fresh alias serves 404 until it propagates, so anything except
			// a real page (2xx) or an auth redirect (3xx) means "not yet". A
			// Vercel SSO redirect is not an app auth redirect: it means every
			// later check would be vacuous, so refuse to pretend to test.
			if (
				res.status >= 300 &&
				res.status < 400 &&
				res.headers.get("location")?.includes("vercel.com/sso-api")
			) {
				console.error(
					`${base} is behind Vercel Deployment Protection and no ` +
						"VERCEL_AUTOMATION_BYPASS_SECRET is set — checks would be vacuous.",
				);
				process.exit(1);
			}
			if (res.status < 400) return;
			lastDetail = `HTTP ${res.status}`;
		} catch (error) {
			lastDetail = String(error);
		}
		await new Promise((r) => setTimeout(r, 3000));
	}
	console.error(`${base} never became reachable: ${lastDetail}`);
	process.exit(1);
}

// Served-locale check: request the document as a Japanese browser would and
// verify the server actually localized it. Two signals, both read from the
// raw served HTML so client-side patch-up cannot mask a server regression:
// the html lang attribute must be the resolved locale, and the page must
// contain CJK text. Guards the failure mode where RSC seeding activates the
// default locale and every visitor gets English (found in production
// 2026-08-29 on 25 pages, invisible to status-code checks).
const CJK = /[\u3040-\u30ff\u3400-\u9fff]/g;
async function hitLocalized(route: string) {
	const url = `${base}${route}`;
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { ...bypassHeaders, "Accept-Language": "ja" },
			redirect: "manual",
		});
	} catch (error) {
		failures.push({
			route,
			mode: "ja",
			detail: `request failed: ${String(error)}`,
		});
		return;
	}
	if (res.status >= 300) return; // redirects and errors are the plain pass's job
	const body = await res.text();
	const lang = body.match(/<html[^>]*\slang="([^"]*)"/)?.[1];
	if (lang !== undefined && lang !== "ja") {
		failures.push({ route, mode: "ja", detail: `served lang="${lang}"` });
		return;
	}
	if ((body.match(CJK)?.length ?? 0) < 10) {
		failures.push({
			route,
			mode: "ja",
			detail: "no Japanese text in served HTML",
		});
	}
}

async function hit(route: string, mode: "document" | "rsc") {
	const url =
		mode === "document"
			? `${base}${route}`
			: `${base}${route}${route.includes("?") ? "&" : "?"}_rsc=smoke`;
	const headers: Record<string, string> = mode === "rsc" ? { RSC: "1" } : {};
	let res: Response;
	try {
		res = await fetch(url, { headers, redirect: "manual" });
	} catch (error) {
		failures.push({ route, mode, detail: `request failed: ${String(error)}` });
		return;
	}
	// Any 4xx or 5xx on a listed route is a failure: 404 means the page is
	// gone, 401/403 mean a public route got gated, 5xx is the app breaking.
	// Redirects are fine — auth-gated routes legitimately send you to sign-in.
	if (res.status >= 400) {
		failures.push({ route, mode, detail: `HTTP ${res.status}` });
		return;
	}
	const body = await res.text();
	// A caught server-component error still returns 200 with a digest in the
	// payload, so status alone is not enough.
	// Next embeds flight data as an escaped JSON string, so the payload reads
	// \"digest\":\"abc\" rather than "digest":"abc". Match both — an
	// unescaped-only pattern silently passes every real error page.
	const digest = body.match(/\\?"digest\\?"\s*:\s*\\?"([^"\\]+)/);
	if (digest) {
		failures.push({ route, mode, detail: `error digest ${digest[1]}` });
		return;
	}
	if (/An error occurred in the Server Components render/.test(body)) {
		failures.push({ route, mode, detail: "server components render error" });
	}
}

await waitForReady();

for (const route of routes) {
	await hit(route, "document");
	await hit(route, "rsc");
	if (localized) await hitLocalized(route);
	const bad = failures.filter((f) => f.route === route);
	console.log(
		`${bad.length === 0 ? "ok  " : "FAIL"} ${route}${bad.length ? `  ${bad.map((b) => `${b.mode}: ${b.detail}`).join("; ")}` : ""}`,
	);
}

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed:`);
	for (const f of failures) {
		console.error(`  ${f.route} [${f.mode}] ${f.detail}`);
	}
	process.exit(1);
}
console.log(`\nall ${routes.length} routes ok (document + RSC)`);
