import type { ToolDefinition } from "./types";

function tool(
	name: string,
	description: string,
	properties: Record<string, object>,
	required: string[],
	readOnly: boolean,
	destructive = false,
): ToolDefinition {
	return {
		name,
		description,
		inputSchema: { type: "object", properties, required },
		annotations: { readOnlyHint: readOnly, destructiveHint: destructive },
	};
}

const BUDGET_ID = {
	type: "string",
	description:
		'Budget id from list_budgets. Defaults to "last-used"; "default" also works.',
};
const MONTH = {
	type: "string",
	description:
		'Budget month as YYYY-MM or YYYY-MM-DD (any day resolves to that month). Defaults to "current".',
};
const TRANSACTION_ID = {
	type: "string",
	description: "Transaction id from list_transactions.",
};
const ACCOUNT_ID = {
	type: "string",
	description: "Account id from list_accounts.",
};
const CATEGORY_ID = {
	type: "string",
	description: "Category id from list_categories.",
};
const AMOUNT = {
	type: "number",
	description:
		"Amount in currency units, negative for outflow: -12.34 spends 12.34, 250 is inflow of 250.",
};
const CLEARED = {
	type: "string",
	enum: ["cleared", "uncleared", "reconciled"],
	description: 'Defaults to "uncleared" on new transactions.',
};
const FLAG_COLOR = {
	type: "string",
	enum: ["red", "orange", "yellow", "green", "blue", "purple"],
};

const WRITE_FIELDS = {
	payee_name: {
		type: "string",
		description:
			"Payee by name; YNAB creates it if new. Use payee_id instead to reuse an exact payee.",
	},
	payee_id: { type: "string", description: "Payee id from list_payees." },
	category_id: CATEGORY_ID,
	memo: { type: "string" },
	cleared: CLEARED,
	approved: { type: "boolean" },
	flag_color: FLAG_COLOR,
};

export function getTools(): ToolDefinition[] {
	return [
		tool(
			"list_budgets",
			"Lists the budgets this token can reach, with currency and last-modified date",
			{},
			[],
			true,
		),
		tool(
			"list_accounts",
			"Lists accounts with their working, cleared, and uncleared balances",
			{
				budget_id: BUDGET_ID,
				include_closed: {
					type: "boolean",
					description: "Include closed accounts. Defaults to false.",
				},
			},
			[],
			true,
		),
		tool(
			"list_categories",
			"Lists category groups with budgeted, activity, and available amounts for one month",
			{
				budget_id: BUDGET_ID,
				month: MONTH,
				include_hidden: {
					type: "boolean",
					description: "Include hidden categories. Defaults to false.",
				},
			},
			[],
			true,
		),
		tool(
			"get_month_summary",
			"Reads one budget month: income, budgeted, activity, to-be-budgeted, age of money, and overspent categories",
			{ budget_id: BUDGET_ID, month: MONTH },
			[],
			true,
		),
		tool(
			"list_payees",
			"Lists payees, for resolving a name to a payee id",
			{ budget_id: BUDGET_ID },
			[],
			true,
		),
		tool(
			"list_transactions",
			"Lists transactions, newest first. Filter by one of account, category, or payee, and optionally by date or review state",
			{
				budget_id: BUDGET_ID,
				account_id: ACCOUNT_ID,
				category_id: CATEGORY_ID,
				payee_id: { type: "string", description: "Payee id from list_payees." },
				since_date: {
					type: "string",
					description:
						"Only transactions on or after this ISO date. YNAB defaults this to one year ago, so pass it to reach anything older.",
				},
				until_date: {
					type: "string",
					description: "Only transactions on or before this ISO date.",
				},
				type: {
					type: "string",
					enum: ["uncategorized", "unapproved"],
					description: "Restrict to transactions needing attention.",
				},
				limit: {
					type: "number",
					description: "How many to return. Defaults to 50.",
				},
			},
			[],
			true,
		),
		tool(
			"get_transaction",
			"Reads one transaction, including its splits",
			{ budget_id: BUDGET_ID, transaction_id: TRANSACTION_ID },
			["transaction_id"],
			true,
		),
		tool(
			"list_scheduled_transactions",
			"Lists scheduled transactions with their next date and frequency",
			{ budget_id: BUDGET_ID },
			[],
			true,
		),

		tool(
			"create_transaction",
			"Records a transaction in an account. Pass splits to divide it across categories",
			{
				budget_id: BUDGET_ID,
				account_id: ACCOUNT_ID,
				date: {
					type: "string",
					description: "ISO date the transaction happened, e.g. 2026-09-28.",
				},
				amount: AMOUNT,
				...WRITE_FIELDS,
				import_id: {
					type: "string",
					description:
						"Idempotency key: a second create with the same import_id is rejected instead of duplicating.",
				},
				splits: {
					type: "array",
					description:
						"Split lines. Their amounts must add up to amount, and category_id on the parent is ignored.",
					items: {
						type: "object",
						properties: {
							amount: AMOUNT,
							category_id: CATEGORY_ID,
							payee_name: { type: "string" },
							memo: { type: "string" },
						},
						required: ["amount"],
					},
				},
			},
			["account_id", "date", "amount"],
			false,
		),
		tool(
			"update_transaction",
			"Changes fields on one transaction. Omitted fields keep their current value; pass null to empty memo, category_id, or flag_color. YNAB ignores date, amount, and category changes on a split transaction",
			{
				budget_id: BUDGET_ID,
				transaction_id: TRANSACTION_ID,
				account_id: ACCOUNT_ID,
				date: { type: "string", description: "New ISO date." },
				amount: AMOUNT,
				...WRITE_FIELDS,
			},
			["transaction_id"],
			false,
		),
		tool(
			"delete_transaction",
			"Deletes a transaction. YNAB has no undo for this",
			{ budget_id: BUDGET_ID, transaction_id: TRANSACTION_ID },
			["transaction_id"],
			false,
			true,
		),
		tool(
			"set_category_budget",
			"Sets how much is budgeted to a category in one month, replacing the current amount",
			{
				budget_id: BUDGET_ID,
				month: MONTH,
				category_id: CATEGORY_ID,
				amount: {
					type: "number",
					description:
						"Budgeted amount in currency units, e.g. 400 budgets 400.00.",
				},
			},
			["category_id", "amount"],
			false,
		),
	];
}
