import { FaSlack } from "react-icons/fa";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { Sentence } from "../components/Sentence";
import type { SentenceContext, TriggerProvider } from "../types";
import { EmojiNameChip } from "./components/EmojiNameChip";
import {
	SLACK_MENU,
	SLACK_SENTENCES,
	type SlackConfig,
	type Slot,
} from "./grammar";

/**
 * Renders one slot of a Slack sentence. Each slot names the config field it
 * edits, so `set` patches by that name and `mark` finds it in the problems.
 */
function renderSlot(
	config: SlackConfig,
	slot: Slot,
	index: number,
	{ set, mark, options, state, disabled }: SentenceContext,
) {
	switch (slot) {
		case "channels":
			return (
				<ScopeChip
					key={index}
					scope={config.channels}
					onChange={(v) => set({ channels: v })}
					className={mark("channels")}
					options={options.slack?.channels ?? []}
					emptyLabel="Select channels"
					anyLabel="Any channel"
					// Slack only delivers events from channels the bot is in, so "any
					// channel" would promise more than it can watch.
					allowAny={false}
					countNoun={{ singular: "channel", plural: "channels" }}
					// The roster only lists channels the bot can see plus public ones;
					// a pasted id is the way in for anything else.
					allowCustom={{
						placeholder: "Search channels or paste channel ID...",
					}}
					state={state}
					disabled={disabled}
				/>
			);
		case "emoji":
			return (
				<EmojiNameChip
					key={index}
					names={config.emoji.mode === "list" ? config.emoji.ids : []}
					onChange={(names) => set({ emoji: { mode: "list", ids: names } })}
					className={mark("emoji")}
					emptyLabel="Select emoji"
					placeholder=":bug: or bug, eyes"
					disabled={disabled}
				/>
			);
		case "actor": {
			// Ahead-of-time people filters are gone from the editor — every new
			// trigger listens to anyone. A legacy row that still carries a list
			// keeps its chip, so the filter stays visible and removable.
			const legacyList =
				config.actor.mode === "list" && config.actor.ids.length > 0;
			if (!legacyList) {
				return (
					<span key={index} className="text-[13px] text-muted-foreground">
						Anyone
					</span>
				);
			}
			return (
				<ScopeChip
					key={index}
					scope={config.actor}
					onChange={(v) => set({ actor: v })}
					className={mark("actor")}
					options={options.slack?.people ?? []}
					emptyLabel="Select people"
					anyLabel="Anyone"
					countNoun={{ singular: "person", plural: "people" }}
					state={state}
					disabled={disabled}
				/>
			);
		}
		case "messageFilter": {
			// The same field filters a message's text or a new channel's name;
			// only the words around it change.
			const isChannelName = config.event === "channel_created";
			return (
				<TextFilterChip
					key={index}
					value={config.messageFilter}
					onChange={(v) => set({ messageFilter: v })}
					emptyLabel={isChannelName ? "Any name" : "Any message"}
					placeholder={
						isChannelName
							? "Name contains this text..."
							: "Contains this text..."
					}
					disabled={disabled}
				/>
			);
		}
		case "completionReaction": {
			// A row saved before this field existed has no key at all; the schema
			// defaults it on save, so the chip must show the same default rather
			// than "No reaction" for a value that will save as a check mark.
			const reaction =
				"completionReaction" in config
					? config.completionReaction
					: "white_check_mark";
			return (
				<EmojiNameChip
					key={index}
					names={reaction ? [reaction] : []}
					// One reaction: the last name typed wins, so ":eyes: :bug:" ends
					// as bug rather than silently reacting twice.
					onChange={(names) =>
						set({ completionReaction: names[names.length - 1] ?? null })
					}
					emptyLabel="No reaction"
					placeholder=":custom_emoji_name:"
					noneLabel="No reaction"
					defaultName="white_check_mark"
					disabled={disabled}
				/>
			);
		}
	}
}

export const slackProvider: TriggerProvider<SlackConfig> = {
	kind: "slack",
	connectionProvider: "slack",
	optionGroup: "slack",
	label: "Slack",
	icon: FaSlack,
	menu: SLACK_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={SLACK_SENTENCES[config.event]}
			fallback={config.event}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
	// Slack only delivers message events for channels the bot is in, so a
	// trigger watching a channel it hasn't joined is configured fine and
	// permanently silent. Saving auto-joins public channels; what this warns
	// about is the rest — private channels, and installs without the join
	// scope yet — where a human invite is the only fix.
	runtimeWarnings: (config, options) => {
		if (config.event === "channel_created") return [];
		if (config.channels.mode !== "list") return [];
		const roster = options.slack?.channels ?? [];
		const outside = config.channels.ids.flatMap((id) => {
			const option = roster.find((o) => o.id === id);
			return option?.botMember === false ? [option.label] : [];
		});
		if (outside.length === 0) return [];
		const list = outside.join(", ");
		return [
			`This trigger will not run for messages in ${list} until @Superset is invited.`,
		];
	},
};
