import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export type ToolDefinition = Tool;
export type ToolResult = CallToolResult;

export type Handler = (
	args: Record<string, unknown>,
	token: string,
) => Promise<ToolResult>;

export interface Budget {
	id: string;
	name: string;
	last_modified_on?: string | null;
	first_month?: string | null;
	last_month?: string | null;
	currency_format?: { iso_code?: string } | null;
}

export interface Account {
	id: string;
	name: string;
	type: string;
	on_budget: boolean;
	closed: boolean;
	deleted: boolean;
	balance: number;
	balance_formatted?: string | null;
	cleared_balance: number;
	cleared_balance_formatted?: string | null;
	uncleared_balance: number;
	uncleared_balance_formatted?: string | null;
}

export interface Category {
	id: string;
	name: string;
	category_group_id?: string;
	hidden: boolean;
	deleted: boolean;
	budgeted: number;
	budgeted_formatted?: string | null;
	activity: number;
	activity_formatted?: string | null;
	balance: number;
	balance_formatted?: string | null;
	goal_type?: string | null;
	goal_target?: number | null;
}

export interface CategoryGroup {
	id: string;
	name: string;
	hidden: boolean;
	deleted: boolean;
	categories: Category[];
}

export interface MonthDetail {
	month: string;
	income: number;
	income_formatted?: string | null;
	budgeted: number;
	budgeted_formatted?: string | null;
	activity: number;
	activity_formatted?: string | null;
	to_be_budgeted: number;
	to_be_budgeted_formatted?: string | null;
	age_of_money?: number | null;
	note?: string | null;
	categories?: Category[];
}

export interface Payee {
	id: string;
	name: string;
	transfer_account_id?: string | null;
	deleted: boolean;
}

export interface SubTransaction {
	id?: string;
	amount: number;
	amount_formatted?: string | null;
	memo?: string | null;
	payee_name?: string | null;
	category_id?: string | null;
	category_name?: string | null;
}

export interface Transaction {
	id: string;
	date: string;
	amount: number;
	amount_formatted?: string | null;
	memo?: string | null;
	cleared: string;
	approved: boolean;
	flag_color?: string | null;
	account_id: string;
	account_name?: string;
	payee_id?: string | null;
	payee_name?: string | null;
	category_id?: string | null;
	category_name?: string | null;
	transfer_account_id?: string | null;
	import_id?: string | null;
	deleted: boolean;
	subtransactions?: SubTransaction[];
}

export interface ScheduledTransaction {
	id: string;
	date_first: string;
	date_next: string;
	frequency: string;
	amount: number;
	amount_formatted?: string | null;
	memo?: string | null;
	account_name?: string;
	payee_name?: string | null;
	category_name?: string | null;
	deleted: boolean;
}
