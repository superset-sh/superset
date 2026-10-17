import { describe, expect, it } from "bun:test";
import { resolveWorkspaceIconIndicators } from "./resolveWorkspaceIconIndicators";

describe("resolveWorkspaceIconIndicators", () => {
	it("keeps the PR icon and overlays the working dot while an agent works", () => {
		expect(
			resolveWorkspaceIconIndicators({
				isCreatePending: false,
				workspaceStatus: "working",
				hasPullRequest: true,
			}),
		).toEqual({ showSpinner: false, overlayStatus: "working" });
	});

	it("shows the spinner alone while an agent works without a PR", () => {
		expect(
			resolveWorkspaceIconIndicators({
				isCreatePending: false,
				workspaceStatus: "working",
				hasPullRequest: false,
			}),
		).toEqual({ showSpinner: true, overlayStatus: null });
	});

	it("shows the spinner while the workspace is being created", () => {
		expect(
			resolveWorkspaceIconIndicators({
				isCreatePending: true,
				workspaceStatus: "working",
				hasPullRequest: true,
			}),
		).toEqual({ showSpinner: true, overlayStatus: null });
		expect(
			resolveWorkspaceIconIndicators({
				isCreatePending: true,
				workspaceStatus: "permission",
				hasPullRequest: false,
			}),
		).toEqual({ showSpinner: true, overlayStatus: "permission" });
	});

	for (const workspaceStatus of ["permission", "review", "failed"] as const) {
		for (const hasPullRequest of [true, false]) {
			it(`overlays ${workspaceStatus} on the primary icon (PR: ${hasPullRequest})`, () => {
				expect(
					resolveWorkspaceIconIndicators({
						isCreatePending: false,
						workspaceStatus,
						hasPullRequest,
					}),
				).toEqual({ showSpinner: false, overlayStatus: workspaceStatus });
			});
		}
	}

	it("shows only the primary icon without a status", () => {
		expect(
			resolveWorkspaceIconIndicators({
				isCreatePending: false,
				workspaceStatus: null,
				hasPullRequest: true,
			}),
		).toEqual({ showSpinner: false, overlayStatus: null });
	});
});
