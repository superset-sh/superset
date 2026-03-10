/**
 * Content Editor Page - 콘텐츠 작성/편집
 */
import { useParams } from "@tanstack/react-router";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { ContentEditor } from "../pages/content-editor";

export function ContentEditorPage() {
  const { id } = useParams({ strict: false }) as { id: string };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <PageHeader title="콘텐츠 편집" description="마케팅 콘텐츠를 수정합니다." />
      <ContentEditor contentId={id} />
    </div>
  );
}

export function ContentCreatePage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <PageHeader title="새 콘텐츠" description="새로운 마케팅 콘텐츠를 작성합니다." />
      <ContentEditor />
    </div>
  );
}
