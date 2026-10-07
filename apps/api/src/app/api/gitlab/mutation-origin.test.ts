import { expect, test } from "bun:test";
import { gitlabMutationRequest } from "./mutation-origin";

const origins = ["https://api.example.invalid", "https://web.example.invalid"];
test("browser mutations require an exact trusted Origin", () => {
	for (const origin of [
		"https://evil.invalid",
		"null",
		"https://web.example.invalid/path",
		"https://web.example.invalid.evil.invalid",
	])
		expect(
			gitlabMutationRequest(
				new Request(origins[0] ?? "", {
					headers: { origin, authorization: "Bearer FAKE" },
				}),
				origins,
			),
		).toBeNull();
	for (const origin of origins)
		expect(
			gitlabMutationRequest(
				new Request(origins[0] ?? "", {
					headers: { origin, cookie: "SESSION=FAKE" },
				}),
				origins,
			)?.headers.get("cookie"),
		).toBe("SESSION=FAKE");
});
test("originless bearer requests carry only bearer authentication into authorization", () => {
	expect(
		gitlabMutationRequest(
			new Request(origins[0] ?? "", { headers: { cookie: "SESSION=FAKE" } }),
			origins,
		),
	).toBeNull();
	for (const authorization of ["Basic FAKE", "Bearer", "Bearer TWO TOKENS"])
		expect(
			gitlabMutationRequest(
				new Request(origins[0] ?? "", { headers: { authorization } }),
				origins,
			),
		).toBeNull();
	const allowed = gitlabMutationRequest(
		new Request(origins[0] ?? "", {
			method: "POST",
			headers: {
				cookie: "SESSION=FAKE",
				authorization: "Bearer FAKE",
				"content-type": "application/x-www-form-urlencoded",
			},
			body: "token=FAKE",
		}),
		origins,
	);
	expect(allowed?.headers.get("cookie")).toBeNull();
	expect(allowed?.headers.get("authorization")).toBe("Bearer FAKE");
});
