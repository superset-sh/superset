import { describe, expect, test } from "bun:test";

import { parseFollowUp, pickCandidate } from "./hiring-args";

const row = (
	candidateId: string,
	name: string,
	email: string | null,
	githubUrl: string | null,
	outcome = "active",
	applicationId = `${candidateId}-app`,
) => ({ candidateId, name, email, githubUrl, outcome, applicationId });

describe("hiring script args", () => {
	test("parseFollowUp adds local days and keeps explicit dates", () => {
		const now = new Date(2026, 0, 30);
		expect(parseFollowUp("3d", now)).toBe("2026-02-02");
		expect(parseFollowUp("2026-10-20", now)).toBe("2026-10-20");
		expect(parseFollowUp("tomorrow", now)).toBe("2026-01-31");
		// 2026-01-30 is a Friday: "fri" means next week's, "tue" the coming one.
		expect(parseFollowUp("fri", now)).toBe("2026-02-06");
		expect(parseFollowUp("Tuesday", now)).toBe("2026-02-03");
		expect(() => parseFollowUp("soon", now)).toThrow();
	});

	test("pickCandidate prefers exact email or handle over a name substring", () => {
		const rows = [
			row("1", "Dan Smith", "dan@example.com", "https://github.com/dansmith/"),
			row(
				"2",
				"Danish Prakash",
				"contact@danishpraka.sh",
				"https://github.com/danishprakash",
			),
		];
		expect(pickCandidate("danishprakash", rows).candidateId).toBe("2");
		expect(pickCandidate("github.com/DanishPrakash/", rows).candidateId).toBe(
			"2",
		);
		expect(pickCandidate("DAN@example.com", rows).candidateId).toBe("1");
		expect(() => pickCandidate("dan", rows)).toThrow(/matches 2 candidates/);
	});

	test("pickCandidate acts on the active application and prefers an exact name", () => {
		const rows = [
			row("1", "Dan Smithers", null, null),
			row("2", "Dan Smith", null, null, "rejected", "old-rejected"),
			row("2", "Dan Smith", null, null, "active", "new-active"),
		];
		const picked = pickCandidate("dan smith", rows);
		expect(picked.candidateId).toBe("2");
		expect(picked.applicationId).toBe("new-active");
	});
});
