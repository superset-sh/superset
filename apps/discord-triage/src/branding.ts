import { type Client, EmbedBuilder } from "discord.js";
import { env } from "./env";
import { store } from "./store";

export const BRAND_COLOR = 0x5b5bd6;
export const SUPPORT_NAME = "Superset Support";

export function brandedEmbed(): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(BRAND_COLOR)
		.setFooter({ text: "Superset · superset.sh" });
}

// Username edits are rate limited to a couple per hour, so only touch the
// profile when it drifts from the configured brand.
export async function applyBranding(client: Client<true>) {
	if (env.DISCORD_BOT_NAME && client.user.username !== env.DISCORD_BOT_NAME) {
		await client.user.setUsername(env.DISCORD_BOT_NAME);
		console.log(`renamed bot to ${env.DISCORD_BOT_NAME}`);
	}
	if (
		env.DISCORD_BOT_AVATAR_URL &&
		store.getSetting("avatar_url") !== env.DISCORD_BOT_AVATAR_URL
	) {
		await client.user.setAvatar(env.DISCORD_BOT_AVATAR_URL);
		store.setSetting("avatar_url", env.DISCORD_BOT_AVATAR_URL);
		console.log("updated bot avatar");
	}
}
