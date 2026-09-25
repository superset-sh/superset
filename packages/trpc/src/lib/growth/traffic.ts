import { runHogQL } from "../posthog-hogql";
import {
	type ContentSection,
	DOCS_HOST,
	isAiAssistantSql,
	MARKETING_HOSTS,
	SITE_HOSTS,
	sectionMatchSql,
	sqlList,
	stripLocaleSql,
} from "./site";
import {
	pivotWeekly,
	type WeeklyRow,
	type WeeklyTable,
	weekStarts,
} from "./weeks";

// Every result carries the HogQL it came from so a tile can open the same
// query in PostHog's SQL editor for a drilldown.
export interface WithQuery {
	query: string;
}
export type WeeklyResult = WeeklyTable & WithQuery;
export interface RowsResult<Row> extends WithQuery {
	rows: Row[];
}

// Growth traffic queries against PostHog's sessions table. Sessions carry the
// entry page and referrer, which is what acquisition questions are about; the
// events table is only used where a specific event (download, waitlist) is
// the thing being counted.

export const CHANNEL_KEYS = [
	"organic_search",
	"direct",
	"social",
	"referral",
	"ai",
	"email",
	"video",
	"paid_search",
	"other",
] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

const SITE_HOST_LIST = sqlList(SITE_HOSTS);
const MARKETING_HOST_LIST = sqlList(MARKETING_HOSTS);

function sinceSql(weeks: string[]): string {
	return `toDateTime('${weeks[0]} 00:00:00')`;
}

function sessionsScope(weeks: string[], hosts = SITE_HOST_LIST): string {
	return `$start_timestamp >= ${sinceSql(weeks)} AND $entry_hostname IN (${hosts})`;
}

const CHANNEL_SQL = `multiIf(
	${isAiAssistantSql("$entry_referring_domain")}, 'ai',
	$channel_type = 'Organic Search', 'organic_search',
	$channel_type = 'Paid Search', 'paid_search',
	$channel_type = 'Direct', 'direct',
	$channel_type IN ('Organic Social', 'Paid Social'), 'social',
	$channel_type = 'Referral', 'referral',
	$channel_type = 'Email', 'email',
	$channel_type = 'Organic Video', 'video',
	'other')`;

export async function fetchChannelMix(
	weekCount: number,
): Promise<WeeklyResult> {
	const weeks = weekStarts(weekCount);
	const query = `
SELECT toStartOfWeek($start_timestamp, 1) AS week, ${CHANNEL_SQL} AS channel, uniq(distinct_id) AS visitors
FROM sessions
WHERE ${sessionsScope(weeks)}
GROUP BY week, channel
ORDER BY week`;
	const rows = await runHogQL<WeeklyRow>(query);
	return { ...pivotWeekly(rows, weeks, { order: CHANNEL_KEYS }), query };
}

export async function fetchAiReferrals(
	weekCount: number,
): Promise<WeeklyResult> {
	const weeks = weekStarts(weekCount);
	const query = `
SELECT toStartOfWeek($start_timestamp, 1) AS week, replaceRegexpOne($entry_referring_domain, '^www\\\\.', '') AS assistant, uniq(distinct_id) AS visitors
FROM sessions
WHERE ${sessionsScope(weeks)} AND ${isAiAssistantSql("$entry_referring_domain")} AND $entry_referring_domain != '$direct'
GROUP BY week, assistant
ORDER BY week`;
	const rows = await runHogQL<WeeklyRow>(query);
	return {
		...pivotWeekly(rows, weeks, { limit: 6, overflowKey: "other" }),
		query,
	};
}

const SEARCH_ENGINE_SQL = `multiIf(
	match($entry_referring_domain, 'google\\\\.'), 'Google',
	match($entry_referring_domain, 'bing\\\\.com'), 'Bing',
	match($entry_referring_domain, 'duckduckgo'), 'DuckDuckGo',
	match($entry_referring_domain, 'brave\\\\.com'), 'Brave',
	match($entry_referring_domain, 'yahoo'), 'Yahoo',
	match($entry_referring_domain, 'kagi'), 'Kagi',
	match($entry_referring_domain, 'ecosia'), 'Ecosia',
	match($entry_referring_domain, 'yandex'), 'Yandex',
	match($entry_referring_domain, 'baidu'), 'Baidu',
	'Other')`;

export async function fetchSearchEngines(
	weekCount: number,
): Promise<WeeklyResult> {
	const weeks = weekStarts(weekCount);
	const query = `
SELECT toStartOfWeek($start_timestamp, 1) AS week, ${SEARCH_ENGINE_SQL} AS engine, uniq(distinct_id) AS visitors
FROM sessions
WHERE ${sessionsScope(weeks)} AND $channel_type = 'Organic Search'
GROUP BY week, engine
ORDER BY week`;
	const rows = await runHogQL<WeeklyRow>(query);
	return {
		...pivotWeekly(rows, weeks, { limit: 5, overflowKey: "Other" }),
		query,
	};
}

export interface ReferrerRow {
	domain: string;
	visitors: number;
	sessions: number;
}

// Referrers that are neither search, social, our own hosts, nor assistants:
// directories, blogs, newsletters, and communities that linked to us.
const EXCLUDED_REFERRER_PATTERN = [
	"superset\\\\.sh",
	"boid\\\\.so",
	"google\\\\.",
	"bing\\\\.com",
	"stripe\\\\.com",
	"youtube\\\\.com",
	"chatgpt",
	"openai\\\\.com",
	"claude\\\\.ai",
	"perplexity",
	"gemini",
	"linkedin",
	"reddit",
	"^t\\\\.co$",
	"github\\\\.com",
	"duckduckgo",
	"brave\\\\.com",
	"kagi",
	"ecosia",
	"yandex",
	"baidu",
	"microsoft",
	"apple\\\\.com",
].join("|");

export async function fetchTopReferrers(
	days: number,
): Promise<RowsResult<ReferrerRow>> {
	const query = `
SELECT replaceRegexpOne($entry_referring_domain, '^www\\\\.', '') AS domain, uniq(distinct_id) AS visitors, count() AS sessions
FROM sessions
WHERE $start_timestamp >= now() - INTERVAL ${days} DAY
	AND $entry_hostname IN (${SITE_HOST_LIST})
	AND $entry_referring_domain != '$direct' AND $entry_referring_domain != ''
	AND $channel_type NOT IN ('Organic Search', 'Paid Search', 'Organic Social', 'Paid Social')
	AND NOT match($entry_referring_domain, '${EXCLUDED_REFERRER_PATTERN}')
GROUP BY domain
ORDER BY visitors DESC
LIMIT 15`;
	const rows = await runHogQL<[string, number, number]>(query);
	return {
		rows: rows.map(([domain, visitors, sessions]) => ({
			domain,
			visitors,
			sessions,
		})),
		query,
	};
}

export interface AiAgentRow {
	bot: string;
	pageviews: number;
}

// Assistants that fetch pages on a user's behalf (NotebookLM, Claude Desktop,
// Manus) run a real browser, so PostHog sees them as pageviews and labels the
// user agent. Crawlers that only read HTML never execute the SDK and are not
// visible here.
export async function fetchAiAgents(
	days: number,
): Promise<RowsResult<AiAgentRow>> {
	const query = `
SELECT properties.$virt_bot_name AS bot, count() AS pageviews
FROM events
WHERE event = '$pageview'
	AND timestamp >= now() - INTERVAL ${days} DAY
	AND properties.$host IN (${SITE_HOST_LIST})
	AND properties.$virt_traffic_category IN ('ai_assistant', 'ai_search', 'ai_crawler')
GROUP BY bot
ORDER BY pageviews DESC
LIMIT 10`;
	const rows = await runHogQL<[string, number]>(query);
	return {
		rows: rows.map(([bot, pageviews]) => ({
			bot: bot ?? "unknown",
			pageviews,
		})),
		query,
	};
}

const SECTION_SQL = `multiIf(
	$entry_hostname = '${DOCS_HOST}', 'docs',
	${sectionMatchSql("$entry_pathname", "compare")}, 'compare',
	${sectionMatchSql("$entry_pathname", "blog")}, 'blog',
	${sectionMatchSql("$entry_pathname", "changelog")}, 'changelog',
	match(${stripLocaleSql("$entry_pathname")}, '^/?$'), 'home',
	'other')`;

export async function fetchLandingSections(
	weekCount: number,
): Promise<WeeklyResult> {
	const weeks = weekStarts(weekCount);
	const query = `
SELECT toStartOfWeek($start_timestamp, 1) AS week, ${SECTION_SQL} AS section, uniq(distinct_id) AS visitors
FROM sessions
WHERE ${sessionsScope(weeks)}
GROUP BY week, section
ORDER BY week`;
	const rows = await runHogQL<WeeklyRow>(query);
	return {
		...pivotWeekly(rows, weeks, {
			order: ["home", "compare", "docs", "blog", "changelog", "other"],
		}),
		query,
	};
}

export interface LandingPageRow {
	path: string;
	visitors: number;
	sessions: number;
	bouncePct: number;
}

export type LandingPageScope =
	| Exclude<ContentSection, "home" | "other">
	| "all";

export async function fetchTopLandingPages(
	scope: LandingPageScope,
	days: number,
): Promise<RowsResult<LandingPageRow>> {
	const hosts = scope === "docs" ? sqlList([DOCS_HOST]) : MARKETING_HOST_LIST;
	const pathFilter =
		scope === "all" || scope === "docs"
			? "1 = 1"
			: sectionMatchSql("$entry_pathname", scope);
	const query = `
SELECT ${stripLocaleSql("$entry_pathname")} AS path, uniq(distinct_id) AS visitors, count() AS sessions, round(avg(toInt($is_bounce)) * 100) AS bounce_pct
FROM sessions
WHERE $start_timestamp >= now() - INTERVAL ${days} DAY
	AND $entry_hostname IN (${hosts})
	AND ${pathFilter}
GROUP BY path
ORDER BY visitors DESC
LIMIT 15`;
	const rows = await runHogQL<[string, number, number, number]>(query);
	return {
		rows: rows.map(([path, visitors, sessions, bouncePct]) => ({
			path,
			visitors,
			sessions,
			bouncePct: bouncePct ?? 0,
		})),
		query,
	};
}

export interface ConversionEvents extends WithQuery {
	weeks: string[];
	visitors: number[];
	downloaders: number[];
	waitlistSignups: number[];
}

// Site visitors from sessions, downloads and waitlist joins from events. The
// signups behind these come from Neon (users.created_at) in the router, so
// the funnel is the same "people" from three sources lined up by week.
export async function fetchConversionEvents(
	weekCount: number,
): Promise<ConversionEvents> {
	const weeks = weekStarts(weekCount);
	const visitorsQuery = `
SELECT toStartOfWeek($start_timestamp, 1) AS week, uniq(distinct_id) AS visitors
FROM sessions
WHERE ${sessionsScope(weeks)}
GROUP BY week
ORDER BY week`;
	const eventsQuery = `
SELECT toStartOfWeek(timestamp, 1) AS week,
	uniqIf(person_id, event = 'download_clicked') AS downloaders,
	uniqIf(person_id, event = 'waitlist_signup') AS waitlist_signups
FROM events
WHERE timestamp >= ${sinceSql(weeks)} AND event IN ('download_clicked', 'waitlist_signup')
GROUP BY week
ORDER BY week`;
	const [visitorRows, eventRows] = await Promise.all([
		runHogQL<[string, number]>(visitorsQuery),
		runHogQL<[string, number, number]>(eventsQuery),
	]);
	const visitors = pivotWeekly(
		visitorRows.map(([week, v]) => [week, "visitors", v]),
		weeks,
	);
	const events = pivotWeekly(
		eventRows.flatMap(([week, downloaders, waitlist]) => [
			[week, "downloaders", downloaders] as WeeklyRow,
			[week, "waitlist", waitlist] as WeeklyRow,
		]),
		weeks,
	);
	const zeros = new Array<number>(weeks.length).fill(0);
	const values = (table: WeeklyTable, key: string) =>
		table.series.find((s) => s.key === key)?.values ?? zeros;
	return {
		weeks,
		visitors: values(visitors, "visitors"),
		downloaders: values(events, "downloaders"),
		waitlistSignups: values(events, "waitlist"),
		query: `${visitorsQuery.trim()}\n\n-- downloads and waitlist\n${eventsQuery.trim()}`,
	};
}
