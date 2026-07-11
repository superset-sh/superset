/**
 * Exploratory e2e probe of the session load route against a REAL large
 * Claude transcript. Exercises the exact production pipeline:
 *   listSessions (discovery) -> getSessionMessages (reader)
 *   -> manager getMessages slice semantics (real cursor helpers)
 *   -> timelineFromSessionMessages (client fold)
 * Run: bun load-probe.mts
 */
import {
	getSessionMessages,
	getSubagentMessages,
	listSessions,
	type SessionMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	decodeMessagesCursor,
	encodeMessagesCursor,
	timelineFromSessionMessages,
} from "@superset/session-protocol";

const DIR = "/Users/kirilldubovitskiy/projects/superset-projects/superset";
const SESSION = process.argv[2] ?? "9e3f5ba2-de0e-4058-a582-8c5deb75f6e6";
const PAGE_LIMIT = Number(process.argv[3] ?? 200);

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;
const ms = (n: number) => `${n.toFixed(0)}ms`;

// ── 1. Discovery: the native store as session registry ──────────────
{
	const t0 = performance.now();
	const sessions = await listSessions({ dir: DIR });
	console.log(
		`\n[1] listSessions({dir}) -> ${sessions.length} sessions in ${ms(performance.now() - t0)}`,
	);
	for (const s of sessions.slice(0, 5)) {
		console.log(
			`    ${s.sessionId.slice(0, 8)}  ${mb(s.fileSize ?? 0).padStart(8)}  ${new Date(s.lastModified).toISOString().slice(0, 16)}  ${(s.customTitle ?? s.summary ?? s.firstPrompt ?? "").slice(0, 60)}`,
		);
	}
}

// ── 2. Full load of the 53MB transcript (what the client drain does) ─
let full: SessionMessage[];
{
	const t0 = performance.now();
	full = await getSessionMessages(SESSION, {
		dir: DIR,
		includeSystemMessages: true,
	});
	const heap = process.memoryUsage();
	console.log(
		`\n[2] getSessionMessages(full) -> ${full.length} messages in ${ms(performance.now() - t0)} | rss ${mb(heap.rss)} heapUsed ${mb(heap.heapUsed)}`,
	);
	const byType: Record<string, number> = {};
	let subagentRows = 0;
	const agentIds = new Set<string>();
	for (const m of full) {
		byType[m.type] = (byType[m.type] ?? 0) + 1;
		if (m.parent_tool_use_id !== null) subagentRows++;
		if (m.parent_agent_id) agentIds.add(m.parent_agent_id);
	}
	console.log(`    types: ${JSON.stringify(byType)}`);
	console.log(
		`    rows with parent_tool_use_id: ${subagentRows}, distinct parent_agent_id: ${agentIds.size}`,
	);
}

// ── 3. Pagination walk — EXACT manager getMessages semantics ─────────
{
	const LIMIT = PAGE_LIMIT;
	let cursor: string | null = null;
	let pageCount = 0;
	const collected: SessionMessage[] = [];
	const pageTimes: number[] = [];
	const t0 = performance.now();
	for (;;) {
		const tp = performance.now();
		// Real route: EVERY page call re-reads the entire transcript.
		const transcript = await getSessionMessages(SESSION, {
			dir: DIR,
			includeSystemMessages: true,
		});
		const end =
			cursor === null ? transcript.length : decodeMessagesCursor(cursor);
		if (end === null || end > transcript.length)
			throw new Error(`invalid cursor at page ${pageCount}`);
		const start = Math.max(0, end - LIMIT);
		const items = transcript.slice(start, end);
		const nextCursor = start > 0 ? encodeMessagesCursor(start) : null;
		pageTimes.push(performance.now() - tp);
		collected.unshift(...items);
		pageCount++;
		if (nextCursor === null) break;
		cursor = nextCursor;
	}
	const total = performance.now() - t0;
	console.log(
		`\n[3] pagination walk: ${pageCount} pages x ${LIMIT} -> ${collected.length} messages in ${ms(total)}`,
	);
	console.log(
		`    per-page (incl. full re-parse): min ${ms(Math.min(...pageTimes))} max ${ms(Math.max(...pageTimes))} avg ${ms(pageTimes.reduce((a, b) => a + b) / pageTimes.length)}`,
	);
	// integrity: concatenated pages must equal the full transcript exactly
	const same =
		collected.length === full.length &&
		collected.every((m, i) => m.uuid === full[i]?.uuid);
	console.log(
		`    integrity (no gaps/overlaps/reorder vs full load): ${same ? "OK" : "BROKEN"}`,
	);
}

// ── 4. Fold the full transcript (client-side timeline build) ─────────
let fullUnknown = 0;
{
	const t0 = performance.now();
	const timeline = timelineFromSessionMessages(full);
	const elapsed = performance.now() - t0;
	const kinds: Record<string, number> = {};
	for (const item of timeline.items) {
		kinds[item.kind] = (kinds[item.kind] ?? 0) + 1;
		if (item.kind === "tool_call" && item.name === "Unknown tool")
			fullUnknown++;
	}
	console.log(
		`\n[4] timelineFromSessionMessages(full ${full.length}) -> ${timeline.items.length} items in ${ms(elapsed)}`,
	);
	console.log(`    kinds: ${JSON.stringify(kinds)}`);
	console.log(`    "Unknown tool" placeholders in FULL fold: ${fullUnknown}`);
}

// ── 5. Partial-load folds: boundary orphans and healing ──────────────
{
	const countUnknown = (msgs: SessionMessage[]) => {
		let n = 0;
		for (const item of timelineFromSessionMessages(msgs).items) {
			if (item.kind === "tool_call" && item.name === "Unknown tool") n++;
		}
		return n;
	};
	console.log(`\n[5] partial folds (page-boundary integrity):`);
	console.log(
		`    newest ${PAGE_LIMIT} -> Unknown-tool placeholders: ${countUnknown(full.slice(-PAGE_LIMIT))}`,
	);
	console.log(
		`    newest ${PAGE_LIMIT * 2} (older page prepended) -> ${countUnknown(full.slice(-PAGE_LIMIT * 2))}`,
	);
	console.log(`    full baseline -> ${fullUnknown}`);
}

// ── 6. Subagent transcripts (separate files, dedicated API) ───────────
{
	const withParent = full.filter((m) => m.parent_tool_use_id !== null);
	console.log(
		`\n[6] subagents: ${withParent.length} rows carry parent_tool_use_id in the MAIN transcript`,
	);
	const agentIds = [
		...new Set(
			full.map((m) => m.parent_agent_id).filter((x): x is string => !!x),
		),
	];
	const sample = agentIds[0] ?? withParent[0]?.parent_tool_use_id;
	if (sample) {
		try {
			const sub = await getSubagentMessages(SESSION, sample, { dir: DIR });
			console.log(
				`    getSubagentMessages(${sample.slice(0, 12)}…) -> ${sub.length} messages`,
			);
		} catch (error) {
			console.log(
				`    getSubagentMessages(${sample.slice(0, 12)}…) failed: ${String(error)}`,
			);
		}
	} else {
		console.log(`    no subagent ids found in main transcript rows`);
	}
}
