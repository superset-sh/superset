import { gmail, requireString, text } from "../api";
import { resolveColor } from "../palette";
import type { Handler } from "../types";

interface Label {
	id?: string;
	name?: string;
	type?: string;
	messagesTotal?: number;
	messagesUnread?: number;
	color?: { textColor?: string; backgroundColor?: string };
}

function visibility(args: Record<string, unknown>) {
	return {
		...(args.messageListVisibility
			? { messageListVisibility: args.messageListVisibility }
			: {}),
		...(args.labelListVisibility
			? { labelListVisibility: args.labelListVisibility }
			: {}),
	};
}

function describe(label: Label): string {
	const counts =
		label.messagesTotal === undefined
			? ""
			: ` — ${label.messagesTotal} message(s), ${label.messagesUnread ?? 0} unread`;
	const color = label.color?.backgroundColor
		? ` [${label.color.backgroundColor} on ${label.color.textColor}]`
		: "";
	return `[${label.id}] ${label.name}${color}${counts}`;
}

async function allLabels(accessToken: string): Promise<Label[]> {
	const data = await gmail<{ labels?: Label[] }>(accessToken, "/labels");
	return data.labels ?? [];
}

export const labelHandlers: Record<string, Handler> = {
	list_email_labels: async (_args, accessToken) => {
		const labels = await allLabels(accessToken);
		if (!labels.length) return text("No labels found");
		const system = labels.filter((label) => label.type === "system");
		const user = labels.filter((label) => label.type !== "system");
		const lines = [`${labels.length} label(s)`, "", "System:"];
		for (const label of system) lines.push(`  ${describe(label)}`);
		lines.push("", "User:");
		for (const label of user) lines.push(`  ${describe(label)}`);
		return text(lines.join("\n"));
	},

	create_label: async (args, accessToken) => {
		const color = resolveColor(args.color);
		const label = await gmail<Label>(accessToken, "/labels", {
			method: "POST",
			body: {
				name: requireString(args, "name"),
				...visibility(args),
				...(color ? { color } : {}),
			},
		});
		return text(`✓ Created label ${describe(label)}`);
	},

	update_label: async (args, accessToken) => {
		const labelId = requireString(args, "labelId");
		const color = resolveColor(args.color);
		const label = await gmail<Label>(accessToken, `/labels/${labelId}`, {
			method: "PATCH",
			body: {
				...(args.name ? { name: args.name } : {}),
				...visibility(args),
				...(color ? { color } : {}),
			},
		});
		return text(`✓ Updated label ${describe(label)}`);
	},

	delete_label: async (args, accessToken) => {
		const labelId = requireString(args, "labelId");
		await gmail(accessToken, `/labels/${labelId}`, { method: "DELETE" });
		return text(`✓ Deleted label ${labelId}`);
	},

	get_or_create_label: async (args, accessToken) => {
		const name = requireString(args, "name");
		const existing = (await allLabels(accessToken)).find(
			(label) => label.name?.toLowerCase() === name.toLowerCase(),
		);
		if (existing) return text(`Found existing label ${describe(existing)}`);

		const color = resolveColor(args.color);
		const label = await gmail<Label>(accessToken, "/labels", {
			method: "POST",
			body: { name, ...(color ? { color } : {}) },
		});
		return text(`✓ Created label ${describe(label)}`);
	},
};
