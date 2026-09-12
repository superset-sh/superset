/**
 * One selectable value in a scope or actor chip. `botMember: false` marks a
 * Slack channel the bot cannot read yet — pickable, but the trigger stays
 * silent until someone invites the bot, which the editor warns about.
 */
export type ScopeOption = {
	id: string;
	label: string;
	/** Muted context beside the label in picker rows — a repo's owner org. */
	hint?: string;
	botMember?: boolean;
};
