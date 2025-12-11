/**
 * Shared ringtone data used by both main and renderer processes.
 * This is the single source of truth for ringtone metadata.
 */

export interface RingtoneData {
	id: string;
	name: string;
	description: string;
	filename: string;
	emoji: string;
	color: string;
	/** Duration in seconds */
	duration?: number;
}

/**
 * Built-in ringtones available in the app.
 * Files are located in src/resources/sounds/
 */
export const RINGTONES: RingtoneData[] = [
	{
		id: "default",
		name: "Classic",
		description: "Simple & clean",
		filename: "notification.mp3",
		emoji: "🔔",
		color: "from-slate-500 to-slate-600",
		duration: 1,
	},
	{
		id: "quick",
		name: "Quick Ping",
		description: "Short & sweet",
		filename: "supersetquick.mp3",
		emoji: "⚡",
		color: "from-yellow-400 to-orange-500",
		duration: 3,
	},
	{
		id: "doowap",
		name: "Doo-Wap",
		description: "Retro vibes",
		filename: "supersetdoowap.mp3",
		emoji: "🎷",
		color: "from-purple-500 to-pink-500",
		duration: 10,
	},
	{
		id: "woman",
		name: "Agent Complete",
		description: "Your agent is done!",
		filename: "agentisdonewoman.mp3",
		emoji: "👩‍💻",
		color: "from-cyan-400 to-blue-500",
		duration: 8,
	},
	{
		id: "african",
		name: "African Beats",
		description: "World music energy",
		filename: "codecompleteafrican.mp3",
		emoji: "🌍",
		color: "from-amber-500 to-red-500",
		duration: 9,
	},
	{
		id: "afrobeat",
		name: "Afrobeat",
		description: "Groovy celebration",
		filename: "codecompleteafrobeat.mp3",
		emoji: "🥁",
		color: "from-green-400 to-emerald-600",
		duration: 9,
	},
	{
		id: "edm",
		name: "EDM Drop",
		description: "Bass goes brrrr",
		filename: "codecompleteedm.mp3",
		emoji: "🎧",
		color: "from-violet-500 to-fuchsia-500",
		duration: 56,
	},
	{
		id: "comeback",
		name: "Come Back!",
		description: "Code needs you",
		filename: "comebacktothecode.mp3",
		emoji: "📢",
		color: "from-rose-400 to-red-500",
		duration: 7,
	},
	{
		id: "shabala",
		name: "Shabalaba",
		description: "Ding dong vibes",
		filename: "shabalabadingdong.mp3",
		emoji: "🎉",
		color: "from-indigo-400 to-purple-600",
		duration: 7,
	},
	{
		id: "none",
		name: "Silent",
		description: "Notifications without sound",
		filename: "",
		emoji: "🔇",
		color: "from-gray-400 to-gray-500",
	},
];

export const DEFAULT_RINGTONE_ID = "default";

/**
 * Get a ringtone by ID
 */
export function getRingtoneById(id: string): RingtoneData | undefined {
	return RINGTONES.find((r) => r.id === id);
}

/**
 * Get the filename for a ringtone ID.
 * Returns empty string for "none" (silent) or if not found.
 */
export function getRingtoneFilename(id: string): string {
	const ringtone = getRingtoneById(id);
	return ringtone?.filename ?? "";
}
