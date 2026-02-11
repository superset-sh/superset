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
		id: "shamisen",
		name: "Shamisen",
		description: "Japanese string instrument",
		filename: "shamisen.mp3",
		emoji: "🪕",
		color: "from-slate-500 to-slate-600",
		duration: 1,
	},
	{
		id: "arcade",
		name: "Arcade",
		description: "Retro game sounds",
		filename: "arcade.mp3",
		emoji: "🕹️",
		color: "from-pink-500 to-red-500",
		duration: 3,
	},
	{
		id: "ping",
		name: "Ping",
		description: "Quick alert tone",
		filename: "ping.mp3",
		emoji: "📍",
		color: "from-teal-400 to-cyan-500",
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
		name: "Agent is Done",
		description: "Your agent is done!",
		filename: "agentisdonewoman.mp3",
		emoji: "👩‍💻",
		color: "from-cyan-400 to-blue-500",
		duration: 8,
	},
	{
		id: "african",
		name: "Code Complete",
		description: "World music energy",
		filename: "codecompleteafrican.mp3",
		emoji: "🌍",
		color: "from-amber-500 to-red-500",
		duration: 9,
	},
	{
		id: "afrobeat",
		name: "Afrobeat Code Complete",
		description: "Groovy celebration",
		filename: "codecompleteafrobeat.mp3",
		emoji: "🥁",
		color: "from-green-400 to-emerald-600",
		duration: 9,
	},
	{
		id: "edm",
		name: "Long EDM",
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
];

export const DEFAULT_RINGTONE_ID = "arcade";

/**
 * Get a ringtone by ID
 */
export function getRingtoneById(id: string): RingtoneData | undefined {
	return RINGTONES.find((r) => r.id === id);
}

/**
 * Get the filename for a ringtone ID.
 * Returns empty string if not found.
 */
export function getRingtoneFilename(id: string): string {
	const ringtone = getRingtoneById(id);
	return ringtone?.filename ?? "";
}
