import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { SessionList } from "../pages/session-list";

export function AgentDeskDesignerListPage() {
  const { t } = useFeatureTranslation("agent-desk");

  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <div className="mb-12">
        <h1 className="text-3xl font-medium tracking-tight text-foreground">{t("designerTitle")}</h1>
        <p className="text-muted-foreground/80 mt-2 text-lg font-light">
          {t("designerDescription")}
        </p>
      </div>
      <SessionList type="designer" />
    </div>
  );
}
