import {
	budgetId,
	clearable,
	dateArg,
	money,
	optionalBoolean,
	optionalNumber,
	optionalString,
	requireNumber,
	requireString,
	text,
	toMilliunits,
	ynab,
} from "../api";
import type { Handler, SubTransaction, Transaction } from "../types";

const DEFAULT_LIMIT = 50;

function describe(transaction: Transaction): string {
	const flags: string[] = [];
	if (transaction.cleared !== "cleared") flags.push(transaction.cleared);
	if (!transaction.approved) flags.push("unapproved");
	if (transaction.flag_color) flags.push(`flag ${transaction.flag_color}`);
	if (transaction.transfer_account_id) flags.push("transfer");

	const memo = transaction.memo ? `  memo: ${transaction.memo}` : "";
	const suffix = flags.length ? `  [${flags.join(", ")}]` : "";
	return `[${transaction.id}] ${transaction.date}  ${money(transaction.amount, transaction.amount_formatted)}  ${
		transaction.payee_name ?? "(no payee)"
	} > ${transaction.category_name ?? "Uncategorized"}  (${
		transaction.account_name ?? transaction.account_id
	})${memo}${suffix}`;
}

function describeSplit(split: SubTransaction): string {
	const memo = split.memo ? `  memo: ${split.memo}` : "";
	return `  ${money(split.amount, split.amount_formatted)}  ${split.payee_name ?? ""} > ${
		split.category_name ?? "Uncategorized"
	}${memo}`;
}

const FILTERS = ["account_id", "category_id", "payee_id"] as const;

function listPath(budget: string, args: Record<string, unknown>): string {
	const given = FILTERS.filter(
		(field) => optionalString(args, field) !== undefined,
	);
	if (given.length > 1) {
		throw new Error(
			`filter by one of account_id, category_id, or payee_id, not ${given.join(" and ")}`,
		);
	}

	const accountId = optionalString(args, "account_id");
	if (accountId) return `/plans/${budget}/accounts/${accountId}/transactions`;
	const categoryId = optionalString(args, "category_id");
	if (categoryId)
		return `/plans/${budget}/categories/${categoryId}/transactions`;
	const payeeId = optionalString(args, "payee_id");
	if (payeeId) return `/plans/${budget}/payees/${payeeId}/transactions`;
	return `/plans/${budget}/transactions`;
}

const LIST_TYPES = ["uncategorized", "unapproved"];

function listType(args: Record<string, unknown>): string | undefined {
	const value = optionalString(args, "type");
	if (value !== undefined && !LIST_TYPES.includes(value)) {
		throw new Error(`type must be ${LIST_TYPES.join(" or ")}`);
	}
	return value;
}

function writeFields(args: Record<string, unknown>): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	const payeeId = clearable(args, "payee_id");
	const payeeName = optionalString(args, "payee_name");
	const categoryId = clearable(args, "category_id");
	const memo = clearable(args, "memo");
	const cleared = optionalString(args, "cleared");
	const approved = optionalBoolean(args, "approved");
	const flagColor = clearable(args, "flag_color");

	if (payeeId !== undefined) fields.payee_id = payeeId;
	if (payeeName) fields.payee_name = payeeName;
	if (categoryId !== undefined) fields.category_id = categoryId;
	if (memo !== undefined) fields.memo = memo;
	if (cleared) fields.cleared = cleared;
	if (approved !== undefined) fields.approved = approved;
	if (flagColor !== undefined) fields.flag_color = flagColor;
	return fields;
}

function splits(args: Record<string, unknown>, amount: number): unknown[] {
	const raw = args.splits;
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw)) throw new Error("splits must be an array");

	const lines = raw.map((entry) => {
		const line = entry as Record<string, unknown>;
		return {
			amount: toMilliunits(requireNumber(line, "amount")),
			...(optionalString(line, "category_id")
				? { category_id: optionalString(line, "category_id") }
				: {}),
			...(optionalString(line, "payee_name")
				? { payee_name: optionalString(line, "payee_name") }
				: {}),
			...(optionalString(line, "memo")
				? { memo: optionalString(line, "memo") }
				: {}),
		};
	});

	const total = lines.reduce((sum, line) => sum + line.amount, 0);
	if (total !== amount) {
		throw new Error(
			`splits add up to ${money(total)} but amount is ${money(amount)}`,
		);
	}
	return lines;
}

async function readTransaction(
	token: string,
	budget: string,
	id: string,
): Promise<Transaction> {
	const { transaction } = await ynab<{ transaction: Transaction }>(
		token,
		`/plans/${budget}/transactions/${id}`,
	);
	return transaction;
}

export const transactionHandlers: Record<string, Handler> = {
	list_transactions: async (args, token) => {
		const budget = budgetId(args);
		const limit = optionalNumber(args, "limit") ?? DEFAULT_LIMIT;
		const { transactions } = await ynab<{ transactions: Transaction[] }>(
			token,
			listPath(budget, args),
			{
				query: {
					since_date: dateArg(args, "since_date"),
					until_date: dateArg(args, "until_date"),
					type: listType(args),
				},
			},
		);

		const visible = (transactions ?? [])
			.filter((transaction) => !transaction.deleted)
			.reverse();
		if (!visible.length) return text("No transactions found");

		const page = visible.slice(0, Math.max(1, limit));
		const total = page.reduce(
			(sum, transaction) => sum + transaction.amount,
			0,
		);
		const header =
			visible.length > page.length
				? `${page.length} of ${visible.length} transaction(s), shown total ${money(total)}`
				: `${page.length} transaction(s), total ${money(total)}`;
		return text([header, "", ...page.map(describe)].join("\n"));
	},

	get_transaction: async (args, token) => {
		const transaction = await readTransaction(
			token,
			budgetId(args),
			requireString(args, "transaction_id"),
		);
		const lines = [describe(transaction)];
		for (const split of transaction.subtransactions ?? []) {
			lines.push(describeSplit(split));
		}
		return text(lines.join("\n"));
	},

	create_transaction: async (args, token) => {
		const amount = toMilliunits(requireNumber(args, "amount"));
		const lines = splits(args, amount);
		const importId = optionalString(args, "import_id");

		const { transaction } = await ynab<{ transaction: Transaction }>(
			token,
			`/plans/${budgetId(args)}/transactions`,
			{
				method: "POST",
				body: {
					transaction: {
						account_id: requireString(args, "account_id"),
						date: dateArg(args, "date", true),
						amount,
						...writeFields(args),
						...(importId ? { import_id: importId } : {}),
						...(lines.length ? { subtransactions: lines } : {}),
					},
				},
			},
		);
		return text(`Created ${describe(transaction)}`);
	},

	update_transaction: async (args, token) => {
		const budget = budgetId(args);
		const id = requireString(args, "transaction_id");
		const current = await readTransaction(token, budget, id);
		const amount = optionalNumber(args, "amount");
		const renamingPayee =
			optionalString(args, "payee_name") !== undefined &&
			optionalString(args, "payee_id") === undefined;

		const { transaction } = await ynab<{ transaction: Transaction }>(
			token,
			`/plans/${budget}/transactions/${id}`,
			{
				method: "PUT",
				body: {
					transaction: {
						account_id:
							optionalString(args, "account_id") ?? current.account_id,
						date: dateArg(args, "date") ?? current.date,
						amount:
							amount === undefined ? current.amount : toMilliunits(amount),
						payee_id: renamingPayee ? null : (current.payee_id ?? null),
						category_id: current.category_id ?? null,
						memo: current.memo ?? null,
						cleared: current.cleared,
						approved: current.approved,
						flag_color: current.flag_color ?? null,
						...writeFields(args),
					},
				},
			},
		);

		const lines = [`Updated ${describe(transaction)}`];
		const ignored = current.subtransactions?.length
			? ["date", "amount", "category_id"].filter(
					(field) => args[field] !== undefined,
				)
			: [];
		if (ignored.length) {
			lines.push(
				`Note: this is a split transaction, and YNAB ignores ${ignored.join(", ")} on one. Edit the split in YNAB instead.`,
			);
		}
		return text(lines.join("\n"));
	},

	delete_transaction: async (args, token) => {
		const id = requireString(args, "transaction_id");
		await ynab(token, `/plans/${budgetId(args)}/transactions/${id}`, {
			method: "DELETE",
		});
		return text(`Deleted transaction ${id}`);
	},
};
