import { describe, expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";

import {
	buildServiceAccountJwt,
	classifyQuery,
	dateWindow,
	groupWeekly,
} from "./search-console";

describe("classifyQuery", () => {
	test("splits brand, Apache Superset, and everything else", () => {
		expect(classifyQuery("superset download")).toBe("brand");
		expect(classifyQuery("Superset IDE")).toBe("brand");
		expect(classifyQuery("apache superset dashboard")).toBe("apache");
		expect(classifyQuery("cursor alternatives")).toBe("nonbrand");
	});
});

describe("buildServiceAccountJwt", () => {
	test("produces an RS256 token Google would accept", () => {
		const { privateKey, publicKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
		});
		const token = buildServiceAccountJwt(
			{
				client_email: "growth@example.iam.gserviceaccount.com",
				private_key: privateKey
					.export({ type: "pkcs8", format: "pem" })
					.toString(),
			},
			new Date("2026-09-05T00:00:00Z"),
		);
		const [header, claims, signature] = token.split(".");
		expect(
			JSON.parse(Buffer.from(header ?? "", "base64url").toString()),
		).toEqual({ alg: "RS256", typ: "JWT" });
		const parsedClaims = JSON.parse(
			Buffer.from(claims ?? "", "base64url").toString(),
		);
		expect(parsedClaims).toMatchObject({
			iss: "growth@example.iam.gserviceaccount.com",
			scope: "https://www.googleapis.com/auth/webmasters.readonly",
			aud: "https://oauth2.googleapis.com/token",
			iat: 1788566400,
			exp: 1788570000,
		});
		const verifier = createVerify("RSA-SHA256");
		verifier.update(`${header}.${claims}`);
		expect(
			verifier.verify(publicKey, Buffer.from(signature ?? "", "base64url")),
		).toBe(true);
	});
});

describe("dateWindow", () => {
	test("ends three days ago and starts on a Monday", () => {
		const window = dateWindow(2, new Date("2026-09-05T12:00:00Z"));
		expect(window.end).toBe("2026-09-02");
		expect(window.weeks).toEqual(["2026-08-24", "2026-08-31"]);
		expect(window.start).toBe("2026-08-24");
	});
});

describe("groupWeekly", () => {
	test("takes clicks from complete daily totals and subtracts named-query clicks for non-brand", () => {
		const weeks = ["2026-08-24", "2026-08-31"];
		const totals = [
			{
				keys: ["2026-08-25"],
				clicks: 9,
				impressions: 190,
				ctr: 0.05,
				position: 5,
			},
			{
				keys: ["2026-09-01"],
				clicks: 12,
				impressions: 800,
				ctr: 0.015,
				position: 30,
			},
		];
		// The by-query rows are a truncated list: the long tail on Sep 1 is missing.
		const byQuery = [
			{
				keys: ["2026-08-25", "superset"],
				clicks: 5,
				impressions: 50,
				ctr: 0.1,
				position: 1,
			},
			{
				keys: ["2026-08-25", "cursor alternatives"],
				clicks: 2,
				impressions: 100,
				ctr: 0.02,
				position: 12,
			},
			{
				keys: ["2026-09-01", "apache superset"],
				clicks: 7,
				impressions: 700,
				ctr: 0.01,
				position: 40,
			},
		];
		expect(groupWeekly(totals, byQuery, weeks)).toEqual({
			weeks,
			clicks: [9, 12],
			impressions: [190, 800],
			nonBrandClicks: [4, 5],
		});
	});
});
