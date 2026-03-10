import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const { t } = useFeatureTranslation("agent-desk");
  const config = STATUS_CONFIG[status];
  const label = config ? t(config.key) : status;
  const variant = config?.variant ?? "outline";
  return <Badge variant={variant}>{label}</Badge>;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_CONFIG: Record<string, { key: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  chatting: { key: "statusChatting", variant: "secondary" },
  designing: { key: "statusDesigning", variant: "secondary" },
  uploading: { key: "statusUploading", variant: "outline" },
  parsing: { key: "statusParsing", variant: "outline" },
  analyzing: { key: "statusAnalyzing", variant: "secondary" },
  analyzed: { key: "statusAnalyzed", variant: "secondary" },
  reviewed: { key: "statusReviewed", variant: "default" },
  spec_generated: { key: "statusSpecGenerated", variant: "default" },
  project_created: { key: "statusProjectCreated", variant: "default" },
  executing: { key: "statusExecuting", variant: "secondary" },
  executed: { key: "statusExecuted", variant: "default" },
  failed: { key: "statusFailed", variant: "destructive" },
};
