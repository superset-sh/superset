import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureStudioQueue } from "./FeatureStudioQueue";

mock.module("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

describe("FeatureStudioQueue", () => {
	test("renders request titles and approval counts", () => {
		const markup = renderToStaticMarkup(
			<FeatureStudioQueue
				queue={{
					requests: [
						{
							id: "123e4567-e89b-12d3-a456-426614174099",
							title: "Lead capture widget",
							status: "pending_spec_approval",
							summary: "Reusable lead capture widget",
							createdAt: new Date().toISOString(),
						},
					],
					pendingApprovals: [
						{
							id: "approval_1",
							featureRequestId: "123e4567-e89b-12d3-a456-426614174099",
							approvalType: "spec_plan",
							status: "pending",
						},
					],
				}}
				readyToRegisterCount={2}
				onAdvance={() => undefined}
			/>,
		);

		expect(markup).toContain("Lead capture widget");
		expect(markup).toContain("승인 대기");
		expect(markup).toContain("등록 대기");
	});
});
