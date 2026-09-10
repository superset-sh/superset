import { gmail, requireString, stringList, text } from "../api";
import type { Handler } from "../types";

interface FilterCriteria {
	from?: string;
	to?: string;
	subject?: string;
	query?: string;
	negatedQuery?: string;
	hasAttachment?: boolean;
	excludeChats?: boolean;
	size?: number;
	sizeComparison?: string;
}

interface FilterAction {
	addLabelIds?: string[];
	removeLabelIds?: string[];
	forward?: string;
}

interface Filter {
	id?: string;
	criteria?: FilterCriteria;
	action?: FilterAction;
}

function describe(filter: Filter): string {
	const criteria = Object.entries(filter.criteria ?? {})
		.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
		.join(", ");
	const action = Object.entries(filter.action ?? {})
		.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
		.join(", ");
	return `[${filter.id}]\n  when: ${criteria || "(none)"}\n  then: ${action || "(none)"}`;
}

type Template = (parameters: Record<string, unknown>) => {
	criteria: FilterCriteria;
	action: FilterAction;
};

function labels(parameters: Record<string, unknown>): string[] {
	return stringList(parameters.labelIds, "parameters.labelIds");
}

function required(parameters: Record<string, unknown>, field: string): string {
	const value = parameters[field];
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`parameters.${field} is required for this template`);
	}
	return value.trim();
}

const TEMPLATES: Record<string, Template> = {
	fromSender: (parameters) => ({
		criteria: { from: required(parameters, "senderEmail") },
		action: {
			addLabelIds: labels(parameters),
			...(parameters.archive ? { removeLabelIds: ["INBOX"] } : {}),
		},
	}),
	withSubject: (parameters) => ({
		criteria: { subject: required(parameters, "subjectText") },
		action: {
			addLabelIds: labels(parameters),
			...(parameters.markAsRead ? { removeLabelIds: ["UNREAD"] } : {}),
		},
	}),
	withAttachments: (parameters) => ({
		criteria: { hasAttachment: true },
		action: { addLabelIds: labels(parameters) },
	}),
	largeEmails: (parameters) => {
		const size = Number(parameters.sizeInBytes);
		if (!Number.isFinite(size)) {
			throw new Error("parameters.sizeInBytes is required for this template");
		}
		return {
			criteria: { size, sizeComparison: "larger" },
			action: { addLabelIds: labels(parameters) },
		};
	},
	containingText: (parameters) => ({
		criteria: { query: `"${required(parameters, "searchText")}"` },
		action: {
			addLabelIds: parameters.markImportant
				? [...labels(parameters), "IMPORTANT"]
				: labels(parameters),
		},
	}),
	mailingList: (parameters) => {
		const list = required(parameters, "listIdentifier");
		return {
			criteria: { query: `list:${list} OR subject:[${list}]` },
			action: {
				addLabelIds: labels(parameters),
				...(parameters.archive === false ? {} : { removeLabelIds: ["INBOX"] }),
			},
		};
	},
};

async function create(
	accessToken: string,
	body: { criteria: FilterCriteria; action: FilterAction },
) {
	const filter = await gmail<Filter>(accessToken, "/settings/filters", {
		method: "POST",
		body,
	});
	return text(`✓ Created filter\n${describe(filter)}`);
}

export const filterHandlers: Record<string, Handler> = {
	list_filters: async (_args, accessToken) => {
		const data = await gmail<{ filter?: Filter[] }>(
			accessToken,
			"/settings/filters",
		);
		const filters = data.filter ?? [];
		if (!filters.length) return text("No filters configured");
		return text(
			`${filters.length} filter(s):\n\n${filters.map(describe).join("\n\n")}`,
		);
	},

	get_filter: async (args, accessToken) => {
		const filterId = requireString(args, "filterId");
		const filter = await gmail<Filter>(
			accessToken,
			`/settings/filters/${filterId}`,
		);
		return text(describe(filter));
	},

	create_filter: async (args, accessToken) => {
		const criteria = args.criteria as FilterCriteria | undefined;
		const action = args.action as FilterAction | undefined;
		if (!criteria || !Object.keys(criteria).length) {
			throw new Error("criteria must name at least one condition");
		}
		if (!action || !Object.keys(action).length) {
			throw new Error("action must name at least one effect");
		}
		return await create(accessToken, { criteria, action });
	},

	create_filter_from_template: async (args, accessToken) => {
		const name = requireString(args, "template");
		const template = TEMPLATES[name];
		if (!template) {
			throw new Error(
				`Unknown template "${name}". Valid: ${Object.keys(TEMPLATES).join(", ")}`,
			);
		}
		return await create(
			accessToken,
			template((args.parameters as Record<string, unknown>) ?? {}),
		);
	},

	delete_filter: async (args, accessToken) => {
		const filterId = requireString(args, "filterId");
		await gmail(accessToken, `/settings/filters/${filterId}`, {
			method: "DELETE",
		});
		return text(`✓ Deleted filter ${filterId}`);
	},
};
