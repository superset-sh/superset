import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface AccountRef {
	connectionId: string;
	nickname?: string | null;
	label?: string | null;
}

const PRIMARY = "superset_account";
const FALLBACK = "superset_account_id";

export const ACCOUNT_ARG_NAMES = [PRIMARY, FALLBACK] as const;

export function accountLabel(account: AccountRef): string {
	return account.nickname || account.label || account.connectionId;
}

function schemaProperties(tool: Tool): Record<string, object> {
	const properties = tool.inputSchema?.properties;
	return properties && typeof properties === "object"
		? (properties as Record<string, object>)
		: {};
}

export function accountArgName(tools: readonly Tool[]): string {
	const taken = new Set(
		tools.flatMap((tool) => Object.keys(schemaProperties(tool))),
	);
	return ACCOUNT_ARG_NAMES.find((name) => !taken.has(name)) ?? PRIMARY;
}

function choiceList(accounts: readonly AccountRef[]): string {
	return accounts
		.map((account) => `${account.connectionId} (${accountLabel(account)})`)
		.join(", ");
}

export function accountInstructions(
	connector: string,
	accounts: readonly AccountRef[],
	argName: string,
): string {
	return [
		`${connector} is connected to ${accounts.length} accounts. Every tool takes ${argName}:`,
		...accounts.map(
			(account) => `  ${accountLabel(account)} — ${account.connectionId}`,
		),
		"If the user does not say which account, ask before reading or writing anything.",
	].join("\n");
}

export function withAccountArgument(
	tools: readonly Tool[],
	accounts: readonly AccountRef[],
	argName: string,
): Tool[] {
	const description = `Which connected account to act as: ${choiceList(accounts)}.`;
	const ids = accounts.map((account) => account.connectionId);

	return tools.map((tool) => {
		const schema = tool.inputSchema;
		const required = Array.isArray(schema?.required) ? schema.required : [];
		return {
			...tool,
			inputSchema: {
				...schema,
				type: "object" as const,
				properties: {
					...schemaProperties(tool),
					[argName]: { type: "string", enum: ids, description },
				},
				required: required.includes(argName)
					? required
					: [...required, argName],
			},
		};
	});
}

export type AccountChoice =
	| { ok: true; connectionId: string; rest: Record<string, unknown> }
	| { ok: false; message: string };

export function chooseAccount(
	connector: string,
	accounts: readonly AccountRef[],
	args: Record<string, unknown>,
): AccountChoice {
	const argName =
		ACCOUNT_ARG_NAMES.find((name) => args[name] !== undefined) ?? PRIMARY;
	const raw = args[argName];
	const rest = { ...args };
	delete rest[argName];

	if (raw === undefined || raw === null || raw === "") {
		return {
			ok: false,
			message: `${connector} has ${accounts.length} connected accounts; pass ${argName}. Valid: ${choiceList(accounts)}.`,
		};
	}

	const wanted = String(raw).trim();
	const folded = wanted.toLowerCase();
	const match =
		accounts.find((account) => account.connectionId === wanted) ??
		accounts.find(
			(account) => accountLabel(account).toLowerCase() === folded,
		) ??
		accounts.find(
			(account) => (account.nickname ?? "").toLowerCase() === folded,
		);

	if (!match) {
		return {
			ok: false,
			message: `${argName} "${wanted}" is not a connected ${connector} account. Valid: ${choiceList(accounts)}.`,
		};
	}
	return { ok: true, connectionId: match.connectionId, rest };
}
