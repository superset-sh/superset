import { expect, test } from "bun:test";
import { deriveIssueSearchSelection } from "./useIssueSearchSelection";

test("live native and mixed identity is independent of returned issue rows", () => {
	expect(
		deriveIssueSearchSelection(
			[{ projectId: "p", provider: "gitlab" }],
			1,
			false,
		),
	).toMatchObject({ mode: "gitlab", pending: false });
	expect(
		deriveIssueSearchSelection(
			[
				{ projectId: "p", provider: "gitlab" },
				{ projectId: "g", provider: "github" },
			],
			2,
			false,
		),
	).toMatchObject({ mode: "mixed" });
});
test("missing duplicate or failed metadata never proves a repository provider", () => {
	expect(deriveIssueSearchSelection([], 1, true)).toMatchObject({
		mode: "unknown",
		pending: true,
	});
	expect(
		deriveIssueSearchSelection(
			[
				{ projectId: "p", provider: "gitlab" },
				{ projectId: "p", provider: "gitlab" },
			],
			2,
			false,
		),
	).toMatchObject({ mode: "unknown" });
	expect(
		deriveIssueSearchSelection(
			[
				{
					projectId: "p",
					provider: null,
					error: {
						code: "UNAUTHORIZED",
						message: "Authenticate selected host",
					},
				},
			],
			1,
			false,
		),
	).toMatchObject({ mode: "unknown", error: "Authenticate selected host" });
	expect(
		deriveIssueSearchSelection(
			[{ projectId: "p", provider: "gitlab" }],
			1,
			false,
			"Current host outage",
		),
	).toMatchObject({ mode: "unknown", error: "Current host outage" });
});
