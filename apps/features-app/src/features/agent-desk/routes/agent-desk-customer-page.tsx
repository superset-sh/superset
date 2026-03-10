import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { SessionList } from "../pages/session-list";

export function AgentDeskCustomerPage() {
  const { t } = useFeatureTranslation("agent-desk");

  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <div className="mb-12">
        <h1 className="text-3xl font-medium tracking-tight text-foreground">{t("customerPageTitle")}</h1>
        <p className="text-muted-foreground/80 mt-2 text-lg font-light">
          {t("customerPageDesc")}
        </p>
      </div>
      <SessionList type="customer" />
    </div>
  );
}
