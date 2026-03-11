import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureStudioApprovalPanel } from "./FeatureStudioApprovalPanel";

describe("FeatureStudioApprovalPanel", () => {
	test("renders feedback input and action buttons for human qa mode", () => {
		const markup = renderToStaticMarkup(
			<FeatureStudioApprovalPanel
				mode="human_qa"
				title="프리뷰 검토"
				onApprove={() => undefined}
				onReject={() => undefined}
				onDiscard={() => undefined}
			/>,
		);

		expect(markup).toContain("프리뷰 검토");
		expect(markup).toContain("커스터마이징 진행");
		expect(markup).toContain("수정 요청");
		expect(markup).toContain("프리뷰 검토 메모를 남깁니다.");
	});
});
