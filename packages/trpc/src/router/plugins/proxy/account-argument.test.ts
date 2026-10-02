import { describe, expect, test } from "bun:test";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
	accountArgName,
	accountInstructions,
	accountLabel,
	chooseAccount,
	withAccountArgument,
} from "./account-argument";

const accounts = [
	{ connectionId: "id-work", userLabel: "work" },
	{ connectionId: "id-personal", userLabel: "satya@gmail.com" },
];

function everywhere(
	tools: readonly Tool[],
	refs: readonly { connectionId: string }[] = accounts,
): Map<string, typeof accounts> {
	return new Map(tools.map((t) => [t.name, refs as typeof accounts]));
}

function tool(overrides: Partial<Tool> = {}): Tool {
	return {
		name: "send_email",
		description: "Sends a new email immediately",
		inputSchema: {
			type: "object",
			properties: { body: { type: "string" } },
			required: ["body"],
		},
		...overrides,
	} as Tool;
}

describe("accountLabel", () => {
	test("is the provider's label, or the id when there is none", () => {
		expect(accountLabel(accounts[1])).toBe("satya@gmail.com");
		expect(accountLabel({ connectionId: "id-bare" })).toBe("id-bare");
	});

	// On Slack, Linear and Notion the user label is the person's name, which is
	// the SAME for every account they hold — alone it names neither account.
	test("joins both labels, so two accounts of one person stay distinct", () => {
		const first = accountLabel({
			connectionId: "a",
			userLabel: "Harshith",
			accountLabel: "harshith@tegon.ai",
		});
		const second = accountLabel({
			connectionId: "b",
			userLabel: "Harshith",
			accountLabel: "harshith@superset.sh",
		});

		expect(first).toBe("Harshith · harshith@tegon.ai");
		expect(second).toBe("Harshith · harshith@superset.sh");
		expect(first).not.toBe(second);
	});

	test("does not say the same word twice when a provider repeats it", () => {
		expect(
			accountLabel({
				connectionId: "a",
				userLabel: "me@gmail.com",
				accountLabel: "me@gmail.com",
			}),
		).toBe("me@gmail.com");
	});
});

describe("accountArgName", () => {
	test("is superset_account when nothing upstream claims it", () => {
		expect(accountArgName([tool()])).toBe("superset_account");
	});

	test("falls back when a vendor tool already has that property", () => {
		const colliding = tool({
			inputSchema: {
				type: "object",
				properties: { superset_account: { type: "string" } },
			},
		});
		expect(accountArgName([colliding])).toBe("superset_account_id");
	});

	test("is chosen once for the whole server, not per tool", () => {
		const colliding = tool({
			name: "other",
			inputSchema: {
				type: "object",
				properties: { superset_account: { type: "string" } },
			},
		});
		expect(accountArgName([tool(), colliding])).toBe("superset_account_id");
	});
});

describe("withAccountArgument", () => {
	test("adds a required enum of the account ids and keeps the rest", () => {
		const [injected] = withAccountArgument(
			[tool()],
			everywhere([tool()]),
			"superset_account",
		);
		const properties = injected.inputSchema.properties as Record<
			string,
			Record<string, unknown>
		>;

		expect(properties.superset_account.enum).toEqual([
			"id-work",
			"id-personal",
		]);
		expect(properties.body).toEqual({ type: "string" });
		expect(injected.inputSchema.required).toEqual(["body", "superset_account"]);
	});

	test("names each account in the description so its label can be matched", () => {
		const [injected] = withAccountArgument(
			[tool()],
			everywhere([tool()]),
			"superset_account",
		);
		const description = (
			injected.inputSchema.properties as Record<string, { description: string }>
		).superset_account.description;

		expect(description).toContain("id-work (work)");
		expect(description).toContain("id-personal (satya@gmail.com)");
	});

	test("gives a tool with no properties block one", () => {
		const bare = tool({ inputSchema: { type: "object" } });
		const [injected] = withAccountArgument(
			[bare],
			everywhere([bare]),
			"superset_account",
		);

		expect(injected.inputSchema.properties).toHaveProperty("superset_account");
		expect(injected.inputSchema.required).toEqual(["superset_account"]);
	});

	test("preserves additionalProperties: false", () => {
		const strict = tool({
			inputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		});
		const [injected] = withAccountArgument(
			[strict],
			everywhere([strict]),
			"superset_account",
		);

		expect(injected.inputSchema.additionalProperties).toBe(false);
		expect(injected.inputSchema.properties).toHaveProperty("superset_account");
	});

	test("offers a tool only to the accounts that have it", () => {
		const shared = tool();
		const exclusive = tool({ name: "admin_only" });
		const byTool = new Map([
			[shared.name, accounts],
			[exclusive.name, [accounts[1]]],
		]);

		const [first, second] = withAccountArgument(
			[shared, exclusive],
			byTool,
			"superset_account",
		);
		const enumOf = (t: Tool) =>
			(t.inputSchema.properties as Record<string, { enum: string[] }>)
				.superset_account.enum;

		expect(enumOf(first)).toEqual(["id-work", "id-personal"]);
		expect(enumOf(second)).toEqual(["id-personal"]);
	});

	test("leaves a tool alone when no account claims it", () => {
		const orphan = tool({ name: "orphan" });

		const [injected] = withAccountArgument(
			[orphan],
			new Map(),
			"superset_account",
		);

		expect(injected.inputSchema.properties).not.toHaveProperty(
			"superset_account",
		);
		expect(injected.inputSchema.required).toEqual(["body"]);
	});

	test("does not add the argument twice when required already lists it", () => {
		const once = withAccountArgument(
			[tool()],
			everywhere([tool()]),
			"superset_account",
		);
		const twice = withAccountArgument(
			once,
			everywhere(once),
			"superset_account",
		);

		expect(twice[0].inputSchema.required).toEqual(["body", "superset_account"]);
	});
});

describe("accountInstructions", () => {
	test("counts the accounts and names the argument", () => {
		const text = accountInstructions("google", accounts, "superset_account");

		expect(text).toContain("google is connected to 2 accounts");
		expect(text).toContain("superset_account");
		expect(text).toContain("work — id-work");
	});
});

describe("chooseAccount", () => {
	test("accepts an id and strips the argument from what is forwarded", () => {
		const choice = chooseAccount("google", accounts, {
			superset_account: "id-personal",
			body: "hello",
		});

		expect(choice).toEqual({
			ok: true,
			connectionId: "id-personal",
			rest: { body: "hello" },
		});
	});

	test('accepts the label, so a model writing "work" does not burn a turn', () => {
		const choice = chooseAccount("google", accounts, {
			superset_account: "work",
		});

		expect(choice).toMatchObject({ ok: true, connectionId: "id-work" });
	});

	test("accepts the provider label too", () => {
		const choice = chooseAccount("google", accounts, {
			superset_account: "satya@gmail.com",
		});

		expect(choice).toMatchObject({ ok: true, connectionId: "id-personal" });
	});

	test("reads the fallback name when that is the one advertised", () => {
		const choice = chooseAccount("google", accounts, {
			superset_account_id: "id-work",
			to: "a@example.com",
		});

		expect(choice).toEqual({
			ok: true,
			connectionId: "id-work",
			rest: { to: "a@example.com" },
		});
	});

	test("a missing argument lists the choices", () => {
		const choice = chooseAccount("google", accounts, { body: "hello" });

		expect(choice.ok).toBe(false);
		if (choice.ok) return;
		expect(choice.message).toContain("2 connected accounts");
		expect(choice.message).toContain("id-work (work)");
		expect(choice.message).toContain("pass superset_account");
	});

	test("an unknown id lists the choices rather than guessing", () => {
		const choice = chooseAccount("google", accounts, {
			superset_account: "id-nope",
		});

		expect(choice.ok).toBe(false);
		if (choice.ok) return;
		expect(choice.message).toContain("is not a connected google account");
		expect(choice.message).toContain("id-personal");
	});

	test("an empty string is a missing argument, not an unknown account", () => {
		const choice = chooseAccount("google", accounts, {
			superset_account: "",
		});

		expect(choice.ok).toBe(false);
		if (choice.ok) return;
		expect(choice.message).toContain("pass superset_account");
	});
});
