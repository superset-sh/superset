import { describe, expect, test } from "bun:test";
import { accountIdentity, accountLabels } from "./account-labels";

const GOOGLE = {
	externalUserLabel: "satya@superset.sh",
	externalAccountLabel: "satya@superset.sh",
};

const LINEAR = {
	externalUserLabel: "satya@superset.sh",
	externalAccountLabel: "Superset",
};

describe("accountLabels", () => {
	test("a row with one label reads as one line, not the same line twice", () => {
		expect(accountLabels(GOOGLE, "Google")).toEqual({
			title: "satya@superset.sh",
			subtitle: null,
		});
	});

	test("keeps the account the person is in when it is not the title", () => {
		expect(accountLabels(LINEAR, "Linear")).toEqual({
			title: "satya@superset.sh",
			subtitle: "Superset",
		});
	});

	test("a nickname titles the row and both labels move below it", () => {
		expect(accountLabels({ ...LINEAR, nickname: "Work" }, "Linear")).toEqual({
			title: "Work",
			subtitle: "satya@superset.sh · Superset",
		});
	});

	test("a nickname on a one-label row still shows who it is", () => {
		expect(accountLabels({ ...GOOGLE, nickname: "Work" }, "Google")).toEqual({
			title: "Work",
			subtitle: "satya@superset.sh",
		});
	});

	test("falls back to the account label when there is no user label", () => {
		expect(
			accountLabels({ externalAccountLabel: "Superset" }, "Linear"),
		).toEqual({ title: "Superset", subtitle: null });
	});

	test("names the connector when the provider sent no label at all", () => {
		expect(accountLabels({}, "Linear")).toEqual({
			title: "Linear account",
			subtitle: null,
		});
	});

	test("an empty nickname is not a title", () => {
		expect(accountLabels({ ...GOOGLE, nickname: "" }, "Google")).toEqual({
			title: "satya@superset.sh",
			subtitle: null,
		});
	});

	test("identity prefers the user over the account", () => {
		expect(accountIdentity(LINEAR)).toBe("satya@superset.sh");
	});
});
