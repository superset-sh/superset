import {
	budgetId,
	money,
	monthArg,
	optionalBoolean,
	requireNumber,
	requireString,
	signed,
	text,
	toMilliunits,
	ynab,
} from "../api";
import type {
	Account,
	Budget,
	Category,
	CategoryGroup,
	Handler,
	MonthDetail,
	Payee,
	ScheduledTransaction,
} from "../types";

function describeAccount(account: Account): string {
	const flags = [account.type];
	if (!account.on_budget) flags.push("off-budget");
	if (account.closed) flags.push("closed");
	return `[${account.id}] ${account.name} — ${flags.join(", ")}, balance ${money(
		account.balance,
		account.balance_formatted,
	)} (cleared ${money(
		account.cleared_balance,
		account.cleared_balance_formatted,
	)}, uncleared ${money(
		account.uncleared_balance,
		account.uncleared_balance_formatted,
	)})`;
}

function describeCategory(category: Category): string {
	const goal =
		category.goal_type && category.goal_target
			? `, goal ${category.goal_type} ${money(category.goal_target)}`
			: "";
	return `[${category.id}] ${category.name} — budgeted ${money(
		category.budgeted,
		category.budgeted_formatted,
	)}, activity ${signed(
		category.activity,
		category.activity_formatted,
	)}, available ${money(category.balance, category.balance_formatted)}${goal}${
		category.hidden ? " [hidden]" : ""
	}`;
}

export const budgetHandlers: Record<string, Handler> = {
	list_budgets: async (_args, token) => {
		const { plans } = await ynab<{ plans: Budget[] }>(token, "/plans");
		if (!plans?.length) return text("No budgets found");
		const lines = plans.map((budget) => {
			const currency = budget.currency_format?.iso_code ?? "unknown currency";
			const modified = budget.last_modified_on
				? `, last modified ${budget.last_modified_on.slice(0, 10)}`
				: "";
			return `[${budget.id}] ${budget.name} — ${currency}${modified}`;
		});
		return text([`${plans.length} budget(s)`, "", ...lines].join("\n"));
	},

	list_accounts: async (args, token) => {
		const { accounts } = await ynab<{ accounts: Account[] }>(
			token,
			`/plans/${budgetId(args)}/accounts`,
		);
		const includeClosed = optionalBoolean(args, "include_closed") ?? false;
		const visible = (accounts ?? []).filter(
			(account) => !account.deleted && (includeClosed || !account.closed),
		);
		if (!visible.length) return text("No accounts found");

		const onBudget = visible
			.filter((account) => account.on_budget && !account.closed)
			.reduce((total, account) => total + account.balance, 0);

		return text(
			[
				`${visible.length} account(s), on-budget total ${money(onBudget)}`,
				"",
				...visible.map(describeAccount),
			].join("\n"),
		);
	},

	list_categories: async (args, token) => {
		const budget = budgetId(args);
		const month = monthArg(args);
		const includeHidden = optionalBoolean(args, "include_hidden") ?? false;

		const { category_groups } = await ynab<{
			category_groups: CategoryGroup[];
		}>(token, `/plans/${budget}/categories`);

		const overlay = new Map<string, Category>();
		if (month !== "current") {
			const detail = await ynab<{ month: MonthDetail }>(
				token,
				`/plans/${budget}/months/${month}`,
			);
			for (const category of detail.month?.categories ?? []) {
				overlay.set(category.id, category);
			}
		}

		const lines: string[] = [];
		for (const group of category_groups ?? []) {
			if (group.deleted || (!includeHidden && group.hidden)) continue;
			const categories = group.categories.filter(
				(category) => !category.deleted && (includeHidden || !category.hidden),
			);
			if (!categories.length) continue;
			lines.push(`${group.name}:`);
			for (const category of categories) {
				lines.push(
					`  ${describeCategory(overlay.get(category.id) ?? category)}`,
				);
			}
			lines.push("");
		}
		if (!lines.length) return text("No categories found");
		return text([`Categories for ${month}`, "", ...lines].join("\n").trimEnd());
	},

	get_month_summary: async (args, token) => {
		const month = monthArg(args);
		const { month: detail } = await ynab<{ month: MonthDetail }>(
			token,
			`/plans/${budgetId(args)}/months/${month}`,
		);
		if (!detail) return text(`No data for ${month}`);

		const overspent = (detail.categories ?? [])
			.filter((category) => !category.deleted && category.balance < 0)
			.sort((a, b) => a.balance - b.balance);

		const lines = [
			`Month ${detail.month}`,
			`  Income: ${money(detail.income, detail.income_formatted)}`,
			`  Budgeted: ${money(detail.budgeted, detail.budgeted_formatted)}`,
			`  Activity: ${signed(detail.activity, detail.activity_formatted)}`,
			`  To be budgeted: ${money(
				detail.to_be_budgeted,
				detail.to_be_budgeted_formatted,
			)}`,
			`  Age of money: ${detail.age_of_money ?? "n/a"} day(s)`,
		];
		if (detail.note) lines.push(`  Note: ${detail.note}`);
		if (overspent.length) {
			lines.push("", `${overspent.length} overspent category/ies:`);
			for (const category of overspent.slice(0, 20)) {
				lines.push(
					`  [${category.id}] ${category.name} — ${money(
						category.balance,
						category.balance_formatted,
					)}`,
				);
			}
		}
		return text(lines.join("\n"));
	},

	list_payees: async (args, token) => {
		const { payees } = await ynab<{ payees: Payee[] }>(
			token,
			`/plans/${budgetId(args)}/payees`,
		);
		const visible = (payees ?? []).filter((payee) => !payee.deleted);
		if (!visible.length) return text("No payees found");
		return text(
			[
				`${visible.length} payee(s)`,
				"",
				...visible.map(
					(payee) =>
						`[${payee.id}] ${payee.name}${payee.transfer_account_id ? " [transfer]" : ""}`,
				),
			].join("\n"),
		);
	},

	list_scheduled_transactions: async (args, token) => {
		const { scheduled_transactions } = await ynab<{
			scheduled_transactions: ScheduledTransaction[];
		}>(token, `/plans/${budgetId(args)}/scheduled_transactions`);
		const visible = (scheduled_transactions ?? []).filter(
			(scheduled) => !scheduled.deleted,
		);
		if (!visible.length) return text("No scheduled transactions found");
		return text(
			[
				`${visible.length} scheduled transaction(s)`,
				"",
				...visible.map(
					(scheduled) =>
						`[${scheduled.id}] next ${scheduled.date_next} ${scheduled.frequency} ${money(
							scheduled.amount,
							scheduled.amount_formatted,
						)}  ${scheduled.payee_name ?? "(no payee)"} > ${
							scheduled.category_name ?? "Uncategorized"
						}  (${scheduled.account_name ?? "unknown account"})`,
				),
			].join("\n"),
		);
	},

	set_category_budget: async (args, token) => {
		const month = monthArg(args);
		const categoryId = requireString(args, "category_id");
		const { category } = await ynab<{ category: Category }>(
			token,
			`/plans/${budgetId(args)}/months/${month}/categories/${categoryId}`,
			{
				method: "PATCH",
				body: {
					category: { budgeted: toMilliunits(requireNumber(args, "amount")) },
				},
			},
		);
		return text(`Budgeted for ${month}: ${describeCategory(category)}`);
	},
};
