import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface AccountRef {
	connectionId: string;
	userLabel?: string | null;
	accountLabel?: string | null;
}

const PRIMARY = "superset_account";
const ACCOUNT_ARG_NAME = /^superset_account(_id|_\d+)?$/;

export function accountLabel(account: AccountRef): string {
	const parts = [account.userLabel, account.accountLabel].filter(
		(part, index, all): part is string =>
			Boolean(part) && all.indexOf(part) === index,
	);
	return parts.length > 0 ? parts.join(" · ") : account.connectionId;
}

function schemaProperties(tool: Tool): Record<string, object> {
	const properties = tool.inputSchema?.properties;
	return properties && typeof properties === "object"
		? (properties as Record<string, object>)
		: {};
}

export function toolProperties(
	tools: readonly Tool[],
	name?: string,
): Set<string> {
	return new Set(
		tools
			.filter((tool) => name === undefined || tool.name === name)
			.flatMap((tool) => Object.keys(schemaProperties(tool))),
	);
}

export function accountArgName(tools: readonly Tool[]): string {
	const taken = toolProperties(tools);
	if (!taken.has(PRIMARY)) return PRIMARY;
	if (!taken.has(`${PRIMARY}_id`)) return `${PRIMARY}_id`;
	let n = 2;
	while (taken.has(`${PRIMARY}_${n}`)) n++;
	return `${PRIMARY}_${n}`;
}

function choiceList(accounts: readonly AccountRef[]): string {
	return accounts
		.map((account) => `${account.connectionId} (${accountLabel(account)})`)
		.join(", ");
}

export function accountInstructions(
	connector: string,
	accounts: readonly AccountRef[],
): string {
	return [
		`${connector} is connected to ${accounts.length} accounts. Every tool has a required account argument; its schema names it and lists these ids:`,
		...accounts.map(
			(account) => `  ${accountLabel(account)} — ${account.connectionId}`,
		),
		"If the user does not say which account, ask before reading or writing anything.",
	].join("\n");
}

export function withAccountArgument(
	tools: readonly Tool[],
	accountsByTool: ReadonlyMap<string, readonly AccountRef[]>,
	argName: string,
): Tool[] {
	return tools.map((tool) => {
		const accounts = accountsByTool.get(tool.name) ?? [];
		if (accounts.length === 0) return tool;

		const schema = tool.inputSchema;
		const required = Array.isArray(schema?.required) ? schema.required : [];
		return {
			...tool,
			inputSchema: {
				...schema,
				type: "object" as const,
				properties: {
					...schemaProperties(tool),
					[argName]: {
						type: "string",
						enum: accounts.map((account) => account.connectionId),
						description: `Which connected account to act as: ${choiceList(accounts)}.`,
					},
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
	argName: string,
): AccountChoice {
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
	const byId = accounts.filter((account) => account.connectionId === wanted);
	const byLabel =
		byId.length > 0
			? byId
			: accounts.filter(
					(account) =>
						accountLabel(account).toLowerCase() === folded ||
						(account.userLabel ?? "").toLowerCase() === folded,
				);

	if (byLabel.length > 1) {
		return {
			ok: false,
			message: `${argName} "${wanted}" matches ${byLabel.length} ${connector} accounts; pass the id instead: ${choiceList(byLabel)}.`,
		};
	}
	const match = byLabel[0];
	if (!match) {
		return {
			ok: false,
			message: `${argName} "${wanted}" is not a connected ${connector} account. Valid: ${choiceList(accounts)}.`,
		};
	}
	return { ok: true, connectionId: match.connectionId, rest };
}

export type StaleArgumentCheck =
	| { ok: true; args: Record<string, unknown> }
	| { ok: false; message: string };

export function hasAccountArgument(args: Record<string, unknown>): boolean {
	return Object.keys(args).some((name) => ACCOUNT_ARG_NAME.test(name));
}

export function withoutStaleAccountArgument(
	args: Record<string, unknown>,
	accountNames: readonly string[],
	vendorOwned: ReadonlySet<string>,
): StaleArgumentCheck {
	const accepted = new Set(accountNames.map((name) => name.toLowerCase()));
	const rest = { ...args };
	for (const name of Object.keys(rest)) {
		if (!ACCOUNT_ARG_NAME.test(name) || vendorOwned.has(name)) continue;
		const value = rest[name];
		if (value === undefined || value === null || value === "") {
			delete rest[name];
			continue;
		}
		if (!accepted.has(String(value).trim().toLowerCase())) {
			return {
				ok: false,
				message: `${name} "${value}" is no longer a connected account; this plugin now runs under a single account, so retry without ${name}.`,
			};
		}
		delete rest[name];
	}
	return { ok: true, args: rest };
}
