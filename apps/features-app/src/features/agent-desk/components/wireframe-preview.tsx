import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Layers, FileText, ArrowRight, LayoutGrid, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { FlowScreen } from "../types";

interface Props {
  screen: FlowScreen | null;
  platform?: string;
  screens?: FlowScreen[];
}

export function WireframePreview({ screen, screens = [] }: Props) {
  const { t } = useFeatureTranslation("agent-desk");

  return (
    <div className="flex h-full flex-col bg-background/80 backdrop-blur-xl rounded-2xl border border-border/50 shadow-sm overflow-hidden">
      <AnimatePresence mode="wait">
        {!screen ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full flex-col items-center justify-center gap-4"
          >
            <div className="bg-muted/50 border p-4 rounded-2xl">
              <Layers className="text-muted-foreground size-8" />
            </div>
            <p className="text-muted-foreground text-sm font-medium">{t("noScreenSelected")}</p>
          </motion.div>
        ) : (
          <motion.div
            key={screen.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="flex h-full flex-col"
          >
            <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4 bg-muted/5">
              <FileText className="text-primary size-5" />
              <h3 className="text-sm font-semibold tracking-tight flex-1 truncate">{screen.name}</h3>
              <span className="text-muted-foreground text-xs">#{screen.order + 1}</span>
            </div>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-5 p-5">
                <SpecSection title={t("screenDescription") || "화면 설명"} icon={<Info className="size-4" />}>
                  {screen.description ? (
                    <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{screen.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">{t("noDescription") || "에이전트와 대화하여 화면 설명을 추가하세요"}</p>
                  )}
                </SpecSection>

                <KeyElementsSection screen={screen} />

                {screen.wireframeType ? (
                  <SpecSection title={t("wireframeType") || "화면 유형"} icon={<LayoutGrid className="size-4" />}>
                    <span className="inline-flex bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-md ring-1 ring-primary/20">
                      {screen.wireframeType}
                    </span>
                  </SpecSection>
                ) : null}

                <NextScreensSection screen={screen} screens={screens} />

                {screen.wireframeMermaid ? (
                  <SpecSection title={t("wireframeDiagram") || "와이어프레임 구조"} icon={<LayoutGrid className="size-4" />}>
                    <pre className="bg-muted/50 border rounded-lg p-4 text-xs overflow-x-auto">
                      <code className="text-foreground/80 font-mono">{screen.wireframeMermaid}</code>
                    </pre>
                  </SpecSection>
                ) : null}

                <MetadataSection screen={screen} />
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function SpecSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <h4 className="text-xs font-semibold uppercase tracking-wider">{title}</h4>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function KeyElementsSection({ screen }: { screen: FlowScreen }) {
  const { t } = useFeatureTranslation("agent-desk");
  const meta = screen.metadata as Record<string, unknown>;
  const keyElements = Array.isArray(meta?.keyElements) ? (meta.keyElements as string[]) : [];

  if (keyElements.length === 0) return null;

  return (
    <SpecSection title={t("keyElements") || "핵심 요소"} icon={<LayoutGrid className="size-4" />}>
      <ul className="flex flex-col gap-1.5">
        {keyElements.map((el, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-foreground/90">
            <span className="size-1.5 rounded-full bg-primary/60 shrink-0" />
            {el}
          </li>
        ))}
      </ul>
    </SpecSection>
  );
}

function NextScreensSection({ screen, screens }: { screen: FlowScreen; screens: FlowScreen[] }) {
  const { t } = useFeatureTranslation("agent-desk");

  if (screen.nextScreenIds.length === 0) return null;

  const nextScreenNames = screen.nextScreenIds
    .map((id) => screens.find((s) => s.id === id)?.name)
    .filter(Boolean);

  if (nextScreenNames.length === 0) return null;

  return (
    <SpecSection title={t("nextScreens") || "다음 화면"} icon={<ArrowRight className="size-4" />}>
      <div className="flex flex-col gap-1.5">
        {nextScreenNames.map((name, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-foreground/90">
            <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
            {name}
          </div>
        ))}
      </div>
    </SpecSection>
  );
}

function MetadataSection({ screen }: { screen: FlowScreen }) {
  const { t } = useFeatureTranslation("agent-desk");
  const meta = screen.metadata as Record<string, unknown>;

  const displayKeys = Object.keys(meta).filter((k) => k !== "keyElements" && meta[k] != null && meta[k] !== "");
  if (displayKeys.length === 0) return null;

  return (
    <SpecSection title={t("additionalInfo") || "추가 정보"} icon={<Info className="size-4" />}>
      <dl className="flex flex-col gap-2">
        {displayKeys.map((key) => (
          <div key={key} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground font-medium">{key}</dt>
            <dd className="text-sm text-foreground/90">{String(meta[key])}</dd>
          </div>
        ))}
      </dl>
    </SpecSection>
  );
}
