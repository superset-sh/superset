import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { githubTriggerOptions } from "./github/trigger-options";
import { googleTriggerOptions } from "./google/trigger-options";
import { linearTriggerOptions } from "./linear/trigger-options";
import { microsoftTeamsTriggerOptions } from "./microsoft-teams/trigger-options";
import { notionTriggerOptions } from "./notion/trigger-options";
import { sentryTriggerOptions } from "./sentry/trigger-options";
import { slackTriggerOptions } from "./slack/trigger-options";
import { verifyOrgMembership } from "./utils";

/**
 * One selectable value in a scope or actor chip. `botMember` is set only by
 * sources whose events require our bot to be inside the thing the option
 * names (Slack channels): false means the trigger will stay silent until
 * someone invites the bot, and the editor warns from it.
 */
export type TriggerOption = {
	id: string;
	label: string;
	/** Muted context beside the label — a repo's owner org. */
	hint?: string;
	botMember?: boolean;
};

export type TriggerOptionContext = {
	organizationId: string;
	/** Who is asking — matters for per-user connections (Google). */
	userId: string;
};

export type TriggerOptionSource = (
	context: TriggerOptionContext,
) => Promise<TriggerOption[]>;

/**
 * Every pickable list the trigger editor can show, by option group then key:
 * `sentry.projects`, `slack.channels`, `google.calendars`. The group is the
 * key the editor reads under (`options.slack.channels`), and it is what a
 * provider's sentence and its lists agree on.
 *
 * Adding a list means adding a source here. Labels are the display string,
 * ids are what the matcher compares against — a source that returns slugs
 * where the matcher wants numeric ids stops matching the moment something is
 * renamed.
 */
export const triggerOptionSources: Record<
	string,
	Record<string, TriggerOptionSource>
> = {
	github: githubTriggerOptions,
	linear: linearTriggerOptions,
	sentry: sentryTriggerOptions,
	microsoftTeams: microsoftTeamsTriggerOptions,
	google: googleTriggerOptions,
	notion: notionTriggerOptions,
	slack: slackTriggerOptions,
};

export const triggerOptionsRouter = {
	/**
	 * All of one group's lists in one round trip. A source that fails (revoked
	 * token, provider down) yields an empty list rather than failing the rest —
	 * the editor stays usable and the sentence shows what it can.
	 */
	triggerOptions: protectedProcedure
		.input(z.object({ organizationId: z.uuid(), group: z.string() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const sources = triggerOptionSources[input.group] ?? {};
			const context: TriggerOptionContext = {
				organizationId: input.organizationId,
				userId: ctx.session.user.id,
			};
			const entries = await Promise.all(
				Object.entries(sources).map(async ([key, source]) => {
					try {
						return [key, await source(context)] as const;
					} catch (error) {
						console.error(
							`[integration.triggerOptions] ${input.group}.${key} failed:`,
							error,
						);
						return [key, []] as const;
					}
				}),
			);
			return Object.fromEntries(entries) as Record<string, TriggerOption[]>;
		}),
} satisfies TRPCRouterRecord;
