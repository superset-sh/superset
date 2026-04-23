/**
 * Vite-bundled URLs for each built-in ringtone .mp3. Keyed by the filenames
 * declared in `shared/ringtones.ts`. Using `new URL(..., import.meta.url)`
 * lets Vite emit hashed asset URLs in prod and serve the files in dev
 * without copying them into `resources/public/`.
 */
export const builtInRingtoneUrls: Record<string, string> = {
	"shamisen.mp3": new URL(
		"../../../resources/sounds/shamisen.mp3",
		import.meta.url,
	).href,
	"arcade.mp3": new URL("../../../resources/sounds/arcade.mp3", import.meta.url)
		.href,
	"ping.mp3": new URL("../../../resources/sounds/ping.mp3", import.meta.url)
		.href,
	"supersetquick.mp3": new URL(
		"../../../resources/sounds/supersetquick.mp3",
		import.meta.url,
	).href,
	"supersetdoowap.mp3": new URL(
		"../../../resources/sounds/supersetdoowap.mp3",
		import.meta.url,
	).href,
	"agentisdonewoman.mp3": new URL(
		"../../../resources/sounds/agentisdonewoman.mp3",
		import.meta.url,
	).href,
	"codecompleteafrican.mp3": new URL(
		"../../../resources/sounds/codecompleteafrican.mp3",
		import.meta.url,
	).href,
	"codecompleteafrobeat.mp3": new URL(
		"../../../resources/sounds/codecompleteafrobeat.mp3",
		import.meta.url,
	).href,
	"codecompleteedm.mp3": new URL(
		"../../../resources/sounds/codecompleteedm.mp3",
		import.meta.url,
	).href,
	"comebacktothecode.mp3": new URL(
		"../../../resources/sounds/comebacktothecode.mp3",
		import.meta.url,
	).href,
	"shabalabadingdong.mp3": new URL(
		"../../../resources/sounds/shabalabadingdong.mp3",
		import.meta.url,
	).href,
};
