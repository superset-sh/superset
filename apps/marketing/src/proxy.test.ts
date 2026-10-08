import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const ORIGIN = "https://superset.sh";

function run(path: string) {
	const response = proxy(new NextRequest(`${ORIGIN}${path}`));
	return {
		status: response?.status,
		location: response?.headers.get("location")?.replace(ORIGIN, ""),
		rewrite: response?.headers.get("x-middleware-rewrite")?.replace(ORIGIN, ""),
	};
}

describe("proxy", () => {
	test("redirects a capitalized path to its lowercase form in one hop", () => {
		expect(run("/Careers?ref=yc")).toMatchObject({
			status: 308,
			location: "/careers?ref=yc",
		});
		expect(run("/zh-cn/Careers").location).toBe("/zh-CN/careers");
		expect(run("/EN/Pricing").location).toBe("/pricing");
		expect(run("/User/Kitenite").location).toBe("/kitenite");
		expect(run("/JA/User/Kitenite").location).toBe("/ja/kitenite");
		expect(run("/EN/User/Kitenite").location).toBe("/kitenite");
		expect(run("/en/zh-cn/Careers").location).toBe("/zh-CN/careers");
		expect(run("/en/zh-cn/user/Kitenite").location).toBe("/zh-CN/kitenite");
	});

	test("serves canonical paths without a redirect", () => {
		expect(run("/careers").rewrite).toBe("/en/careers");
		expect(run("/zh-CN/careers")).toMatchObject({
			status: undefined,
			location: undefined,
		});
	});
});
