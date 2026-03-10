import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { FileText, GitBranch, Map, Route, BarChart3, Code2, CheckCircle2 } from "lucide-react";
import type { ImplementationHandoff, ArtifactBundle } from "../types";

interface Props {
  handoff: ImplementationHandoff;
}

export function HandoffViewer({ handoff }: Props) {
  const hasArtifacts = handoff.artifacts?.specDraft || handoff.artifacts?.mermaid || handoff.artifacts?.qaMapping;

  return (
    <Tabs defaultValue="router" className="h-full flex flex-col">
      <TabsList className={`grid w-full mb-2 ${hasArtifacts ? "grid-cols-7" : "grid-cols-4"}`}>
        <TabsTrigger value="router" className="text-xs">
          <Route className="mr-1 size-3" />
          라우터
        </TabsTrigger>
        <TabsTrigger value="screens" className="text-xs">
          <Map className="mr-1 size-3" />
          화면 스펙
        </TabsTrigger>
        <TabsTrigger value="nav" className="text-xs">
          <GitBranch className="mr-1 size-3" />
          이동 규칙
        </TabsTrigger>
        <TabsTrigger value="notes" className="text-xs">
          <FileText className="mr-1 size-3" />
          메모
        </TabsTrigger>
        {hasArtifacts ? (
          <>
            <TabsTrigger value="spec-draft" className="text-xs">
              <Code2 className="mr-1 size-3" />
              초안
            </TabsTrigger>
            <TabsTrigger value="mermaid" className="text-xs">
              <BarChart3 className="mr-1 size-3" />
              다이어그램
            </TabsTrigger>
            <TabsTrigger value="qa-mapping" className="text-xs">
              <CheckCircle2 className="mr-1 size-3" />
              QA 매핑
            </TabsTrigger>
          </>
        ) : null}
      </TabsList>

      <ScrollArea className="flex-1">
        <TabsContent value="router" className="mt-0 space-y-2">
          {handoff.routerMap.map((entry) => (
            <Card key={entry.screenId} className="bg-muted/30">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{entry.screenName}</CardTitle>
                  <Badge variant="outline" className="text-xs">{entry.authRule}</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-2 text-xs text-muted-foreground space-y-0.5">
                <p>경로: <code className="text-foreground">{entry.routePath}</code></p>
                <p>부모: <code className="text-foreground">{entry.parentRoute}</code></p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="screens" className="mt-0 space-y-2">
          {handoff.screenSpecs.map((spec) => (
            <Card key={spec.screenId} className="bg-muted/30">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{spec.screenName}</CardTitle>
                  <Badge variant="outline" className="text-xs">{spec.wireframeType}</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-2 text-xs space-y-1">
                <p className="text-muted-foreground">{spec.description}</p>
                {spec.requirements.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {spec.requirements.map((r, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{r}</Badge>
                    ))}
                  </div>
                ) : null}
                <div className="text-muted-foreground space-y-0.5 mt-1">
                  {spec.stateManagement.serverState.length > 0 ? (
                    <p>서버 상태: {spec.stateManagement.serverState.join(", ")}</p>
                  ) : null}
                  {spec.stateManagement.clientState.length > 0 ? (
                    <p>클라이언트 상태: {spec.stateManagement.clientState.join(", ")}</p>
                  ) : null}
                  {spec.stateManagement.formState.length > 0 ? (
                    <p>폼 상태: {spec.stateManagement.formState.join(", ")}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="nav" className="mt-0 space-y-2">
          {handoff.navigationRules.map((rule, i) => (
            <Card key={i} className="bg-muted/30">
              <CardContent className="py-2 px-3 text-xs">
                <p className="font-medium">{rule.fromScreenId} → {rule.toScreenId}</p>
                <p className="text-muted-foreground">트리거: {rule.trigger}</p>
                <p className="text-muted-foreground">조건: {rule.conditionLabel}</p>
                <p className="text-muted-foreground">타입: {rule.transitionType}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="notes" className="mt-0 space-y-2">
          {handoff.implementationNotes.length > 0 ? (
            handoff.implementationNotes.map((note, i) => (
              <Card key={i} className="bg-muted/30">
                <CardContent className="py-2 px-3 text-xs">
                  <p>{note}</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">구현 메모가 없습니다</p>
          )}

          <Separator className="my-2" />
          <p className="text-xs font-medium px-1">생성 정보</p>
          <Card className="bg-muted/30">
            <CardContent className="py-2 px-3 text-xs text-muted-foreground">
              <p>세션: {handoff.sessionId}</p>
              <p>생성일: {handoff.generatedAt}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {hasArtifacts ? (
          <>
            <SpecDraftTab artifacts={handoff.artifacts} />
            <MermaidTab artifacts={handoff.artifacts} />
            <QaMappingTab artifacts={handoff.artifacts} />
          </>
        ) : null}
      </ScrollArea>
    </Tabs>
  );
}

/* Components */

function SpecDraftTab({ artifacts }: { artifacts: ArtifactBundle }) {
  const spec = artifacts.specDraft;
  if (!spec) return null;

  return (
    <TabsContent value="spec-draft" className="mt-0 space-y-2">
      <Card className="bg-muted/30">
        <CardContent className="py-3 px-3">
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{spec.markdown}</pre>
        </CardContent>
      </Card>

      {spec.screenSummaries.length > 0 ? (
        <>
          <Separator className="my-2" />
          <p className="text-xs font-medium px-1">화면 요약 ({spec.screenSummaries.length})</p>
          {spec.screenSummaries.map((s) => (
            <Card key={s.screenId} className="bg-muted/30">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{s.screenName}</CardTitle>
                  <Badge variant="outline" className="text-xs">{s.wireframeType}</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-2 text-xs text-muted-foreground space-y-0.5">
                <p>경로: <code className="text-foreground">{s.routePath}</code></p>
                <p>{s.description}</p>
                {s.keyElements.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.keyElements.map((e, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{e}</Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </>
      ) : null}
    </TabsContent>
  );
}

function MermaidTab({ artifacts }: { artifacts: ArtifactBundle }) {
  const mermaid = artifacts.mermaid;
  if (!mermaid) return null;

  return (
    <TabsContent value="mermaid" className="mt-0 space-y-2">
      <p className="text-xs font-medium px-1">{mermaid.title}</p>
      <Card className="bg-muted/30">
        <CardContent className="py-3 px-3">
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{mermaid.flowChart}</pre>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground px-1">
        생성일: {mermaid.generatedAt}
      </p>
    </TabsContent>
  );
}

function QaMappingTab({ artifacts }: { artifacts: ArtifactBundle }) {
  const qa = artifacts.qaMapping;
  if (!qa) return null;

  const { coverageSummary } = qa;

  return (
    <TabsContent value="qa-mapping" className="mt-0 space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Badge variant="secondary" className="text-xs">
          전체 {coverageSummary.total}
        </Badge>
        <Badge className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          완전 {coverageSummary.full}
        </Badge>
        <Badge className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400">
          부분 {coverageSummary.partial}
        </Badge>
        <Badge className="text-xs bg-red-500/10 text-red-600 dark:text-red-400">
          미매핑 {coverageSummary.none}
        </Badge>
      </div>

      {qa.mappings.map((m) => (
        <Card key={m.requirementId} className="bg-muted/30">
          <CardContent className="py-2 px-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <p className="font-medium">{m.requirementSummary}</p>
              <CoverageBadge coverage={m.coverage} />
            </div>
            <p className="text-muted-foreground">[{m.category}] {m.requirementId}</p>
            {m.linkedScreenIds.length > 0 ? (
              <p className="text-muted-foreground">
                화면: {m.linkedScreenIds.length}개 연결
              </p>
            ) : null}
            {m.linkedEdgeIds.length > 0 ? (
              <p className="text-muted-foreground">
                전이: {m.linkedEdgeIds.length}개 연결
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </TabsContent>
  );
}

function CoverageBadge({ coverage }: { coverage: "full" | "partial" | "none" }) {
  const config = {
    full: { label: "완전", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    partial: { label: "부분", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    none: { label: "미매핑", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  };
  const { label, className } = config[coverage];
  return <Badge variant="secondary" className={`text-xs ${className}`}>{label}</Badge>;
}
