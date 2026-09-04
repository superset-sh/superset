import { slackEmojiName } from "@superset/shared/automation-matching";

/**
 * Glyphs for the standard reactions people type most, keyed by Slack short
 * name, so the chip can show "🐛 bug" instead of ":bug:". Display only: any
 * name is accepted — a workspace's custom emoji have no glyph here and read
 * as `:name:`.
 */
const SLACK_EMOJI_GLYPHS: Record<string, string> = {
	"+1": "👍",
	"-1": "👎",
	eyes: "👀",
	white_check_mark: "✅",
	heavy_check_mark: "✔️",
	x: "❌",
	bug: "🐛",
	fire: "🔥",
	rocket: "🚀",
	tada: "🎉",
	raised_hands: "🙌",
	pray: "🙏",
	heart: "❤️",
	100: "💯",
	warning: "⚠️",
	rotating_light: "🚨",
	question: "❓",
	memo: "📝",
	pushpin: "📌",
	bookmark: "🔖",
	mag: "🔍",
	wrench: "🔧",
	bulb: "💡",
	thinking_face: "🤔",
	clap: "👏",
	wave: "👋",
	ok_hand: "👌",
	hourglass_flowing_sand: "⏳",
	zap: "⚡",
	boom: "💥",
	sos: "🆘",
	robot_face: "🤖",
	ship: "🚢",
};

/** How one emoji name reads in a chip: "🐛", or ":deployparrot:" for a custom one. */
export function emojiLabel(name: string): string {
	return SLACK_EMOJI_GLYPHS[name] ?? `:${name}:`;
}

/**
 * Emoji names as a person types them — ":bug:", "bug", "bug, eyes",
 * ":bug: :eyes:" — normalized to what Slack sends: bare names, no colons.
 */
export function parseEmojiNames(text: string): string[] {
	const seen = new Set<string>();
	for (const raw of text.split(/[\s,]+/)) {
		const name = slackEmojiName(raw);
		if (name) seen.add(name);
	}
	return [...seen];
}
