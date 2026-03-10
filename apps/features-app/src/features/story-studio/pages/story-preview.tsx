/**
 * StoryPreview - Interactive story playthrough engine
 *
 * Pure client-side engine that uses the export endpoint data to simulate
 * playing through the story graph. Shows dialogues, handles choices,
 * tracks flag state, and evaluates conditions.
 */
import { useState } from "react";
import type { StoryStudioExport } from "@superbuilder/features-server/story-studio";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Bug, ChevronRight, Flag, Play, RotateCcw, SkipForward } from "lucide-react";
import { useExportProject } from "../hooks";

export function StoryPreview() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";
  const exportQuery = useExportProject(projectId);

  const [started, setStarted] = useState(false);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);

  const handleStart = async () => {
    const { data } = await exportQuery.refetch();
    if (data) {
      setStarted(true);
    }
  };

  if (!started || !exportQuery.data) {
    return (
      <div className="container mx-auto max-w-2xl space-y-8 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/story-studio/$id", params: { id: projectId } })}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          대시보드
        </Button>

        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-bold">스토리 프리뷰</h1>
          <p className="text-muted-foreground">
            프로젝트 데이터를 로드하여 인터랙티브하게 스토리를 테스트합니다.
          </p>
          <Button size="lg" onClick={handleStart} disabled={exportQuery.isFetching}>
            <Play className="mr-2 h-5 w-5" />
            {exportQuery.isFetching ? "로드 중..." : "프리뷰 시작"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-4 py-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/story-studio/$id", params: { id: projectId } })}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        대시보드
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{exportQuery.data.project.title} — 프리뷰</h1>
        <Select
          value={String(selectedChapterIdx)}
          onValueChange={(v) => setSelectedChapterIdx(Number(v))}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="챕터 선택" />
          </SelectTrigger>
          <SelectContent>
            {exportQuery.data.chapters.map((ch, idx) => (
              <SelectItem key={ch.id} value={String(idx)}>
                {ch.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {exportQuery.data.chapters.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-muted-foreground">챕터가 없습니다. 먼저 챕터를 추가하세요.</p>
          </CardContent>
        </Card>
      ) : (
        <ChapterPlayer exportData={exportQuery.data} chapterIdx={selectedChapterIdx} />
      )}
    </div>
  );
}

/* ===================================================================== */
/* Components                                                             */
/* ===================================================================== */

interface ChapterPlayerProps {
  exportData: StoryStudioExport;
  chapterIdx: number;
}

function ChapterPlayer({ exportData, chapterIdx }: ChapterPlayerProps) {
  const chapter = exportData.chapters[chapterIdx];
  if (!chapter) {
    return <p className="text-muted-foreground">유효하지 않은 챕터입니다.</p>;
  }

  const { nodes, edges } = chapter.graph;
  const startNode = nodes.find((n) => n.type === "start");

  const [currentNodeId, setCurrentNodeId] = useState<string | null>(startNode?.id ?? null);
  const [dialogueIdx, setDialogueIdx] = useState(0);
  const [flagState, setFlagState] = useState<Record<string, string | number | boolean>>(() =>
    initializeFlagState(exportData.flags),
  );
  const [history, setHistory] = useState<string[]>([]);
  const [showDebugger, setShowDebugger] = useState(false);
  const [ended, setEnded] = useState(false);

  const currentNode = nodes.find((n) => n.id === currentNodeId);
  const nodeDialogues = chapter.dialogues
    .filter((d) => d.nodeId === currentNodeId)
    .sort((a, b) => a.order - b.order);

  const outgoingEdges = edges
    .filter((e) => e.sourceNodeId === currentNodeId)
    .sort((a, b) => a.order - b.order);

  const handleRestart = () => {
    setCurrentNodeId(startNode?.id ?? null);
    setDialogueIdx(0);
    setFlagState(initializeFlagState(exportData.flags));
    setHistory([]);
    setEnded(false);
  };

  const handleAdvanceDialogue = () => {
    if (dialogueIdx < nodeDialogues.length - 1) {
      setDialogueIdx(dialogueIdx + 1);
      return;
    }
    // All dialogues shown — auto-advance if single outgoing edge
    advanceFromNode();
  };

  const advanceFromNode = () => {
    const available = outgoingEdges.filter((e) => evaluateConditions(e.conditions, flagState));

    if (available.length === 0) {
      setEnded(true);
      return;
    }

    if (available.length === 1 && currentNode?.type !== "choice") {
      const edge = available[0];
      if (edge) {
        transitionToNode(edge.targetNodeId, edge.effects);
      }
      return;
    }
    // Multiple edges or choice node — wait for user selection (rendered below)
  };

  const transitionToNode = (
    targetNodeId: string,
    effects: { flagId: string; operation: string; value: string | number | boolean }[],
  ) => {
    const newFlags = applyEffects(flagState, effects);
    setFlagState(newFlags);
    setHistory((prev) => [...prev, currentNodeId ?? ""]);

    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (targetNode?.type === "end") {
      setCurrentNodeId(targetNodeId);
      setDialogueIdx(0);
      setEnded(true);
      return;
    }

    setCurrentNodeId(targetNodeId);
    setDialogueIdx(0);
  };

  const handleChooseEdge = (edgeId: string) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    transitionToNode(edge.targetNodeId, edge.effects);
  };

  const characterName = (charId?: string) => {
    if (!charId) return null;
    return exportData.characters.find((c) => c.id === charId)?.name ?? null;
  };

  // Determine display state
  const isShowingDialogues = nodeDialogues.length > 0 && dialogueIdx < nodeDialogues.length;
  const isAtEndOfDialogues = nodeDialogues.length > 0 && dialogueIdx >= nodeDialogues.length - 1;
  const availableChoices = outgoingEdges.filter((e) => evaluateConditions(e.conditions, flagState));
  const showChoices =
    currentNode?.type === "choice" || (isAtEndOfDialogues && availableChoices.length > 1);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Main Panel */}
      <div className="space-y-4 lg:col-span-2">
        {/* Current Node Info */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <NodeTypeBadge type={currentNode?.type ?? "scene"} />
                <CardTitle className="text-lg">{currentNode?.label ?? "—"}</CardTitle>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRestart}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowDebugger(!showDebugger)}
                >
                  <Bug className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardDescription>
              {chapter.title} — 노드 {history.length + 1}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Ended State */}
        {ended ? (
          <Card className="border-primary/30 bg-primary/5 py-8 text-center">
            <CardContent className="space-y-4">
              <h2 className="text-2xl font-bold">
                {currentNode?.type === "end" ? "엔딩 도달" : "경로 종료"}
              </h2>
              <p className="text-muted-foreground">
                {currentNode?.type === "end"
                  ? currentNode.label
                  : "더 이상 진행할 수 있는 경로가 없습니다."}
              </p>
              <Button onClick={handleRestart}>
                <RotateCcw className="mr-1 h-4 w-4" />
                처음부터 다시
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Dialogue Display */}
            {isShowingDialogues ? (
              <Card className="min-h-[200px]">
                <CardContent className="space-y-4 pt-6">
                  {nodeDialogues[dialogueIdx] ? (
                    <DialogueLine
                      dialogue={nodeDialogues[dialogueIdx]}
                      speakerName={characterName(nodeDialogues[dialogueIdx].speakerCharacterId)}
                    />
                  ) : null}

                  <div className="text-muted-foreground text-right text-xs">
                    {dialogueIdx + 1} / {nodeDialogues.length}
                  </div>

                  {/* Show "next" button if there are more dialogues or single path ahead */}
                  {!showChoices ? (
                    <div className="flex justify-end">
                      <Button onClick={handleAdvanceDialogue}>
                        {isAtEndOfDialogues ? (
                          <>
                            <SkipForward className="mr-1 h-4 w-4" />
                            다음 노드
                          </>
                        ) : (
                          <>
                            다음
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : currentNode?.type === "start" ? (
              <Card className="min-h-[200px]">
                <CardContent className="flex items-center justify-center pt-6">
                  <Button onClick={advanceFromNode}>
                    <Play className="mr-1 h-4 w-4" />
                    시작
                  </Button>
                </CardContent>
              </Card>
            ) : nodeDialogues.length === 0 && !showChoices ? (
              <Card className="min-h-[200px]">
                <CardContent className="flex flex-col items-center justify-center gap-3 pt-6">
                  <p className="text-muted-foreground text-sm">이 노드에 대사가 없습니다.</p>
                  <Button onClick={advanceFromNode}>
                    <SkipForward className="mr-1 h-4 w-4" />
                    다음 노드
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {/* Choice Display */}
            {showChoices && isAtEndOfDialogues ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">선택지:</p>
                {availableChoices.map((edge) => (
                  <Button
                    key={edge.id}
                    variant="outline"
                    className="w-full justify-start text-left"
                    onClick={() => handleChooseEdge(edge.id)}
                  >
                    <ChevronRight className="mr-2 h-4 w-4 shrink-0" />
                    {edge.label || "(라벨 없음)"}
                  </Button>
                ))}
                {outgoingEdges.length > availableChoices.length ? (
                  <p className="text-muted-foreground text-xs">
                    {outgoingEdges.length - availableChoices.length}개의 선택지가 조건 미충족으로
                    비활성
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Side Panel — Flag Debugger */}
      {showDebugger ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Flag className="h-4 w-4" />
                플래그 상태
              </CardTitle>
            </CardHeader>
            <CardContent>
              {exportData.flags.length === 0 ? (
                <p className="text-muted-foreground text-xs">플래그 없음</p>
              ) : (
                <div className="space-y-1">
                  {exportData.flags.map((flag) => (
                    <div key={flag.id} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{flag.name}</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {String(flagState[flag.id] ?? flag.defaultValue ?? "—")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">경로 히스토리</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {history.map((nodeId, idx) => {
                  const node = nodes.find((n) => n.id === nodeId);
                  return (
                    <div key={idx} className="text-muted-foreground text-xs">
                      {idx + 1}. {node?.label ?? nodeId.slice(0, 8)}
                    </div>
                  );
                })}
                {currentNode ? (
                  <div className="text-xs font-medium">
                    {history.length + 1}. {currentNode.label} (현재)
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/* ===================================================================== */
/* Sub-Components                                                         */
/* ===================================================================== */

interface DialogueLineProps {
  dialogue: {
    type: string;
    content: string;
    emotion?: string;
    direction?: string;
  };
  speakerName: string | null;
}

function DialogueLine({ dialogue, speakerName }: DialogueLineProps) {
  if (dialogue.type === "direction") {
    return (
      <div className="text-muted-foreground border-l-2 border-dashed pl-3 text-sm italic">
        {dialogue.content}
      </div>
    );
  }

  if (dialogue.type === "narration") {
    return (
      <div className="text-muted-foreground italic">
        <p className="text-base leading-relaxed">{dialogue.content}</p>
      </div>
    );
  }

  if (dialogue.type === "system") {
    return <div className="bg-muted rounded-md p-3 text-center text-sm">{dialogue.content}</div>;
  }

  return (
    <div className="space-y-1">
      {speakerName ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{speakerName}</span>
          {dialogue.emotion ? (
            <Badge variant="outline" className="text-xs">
              {dialogue.emotion}
            </Badge>
          ) : null}
        </div>
      ) : null}
      <p className="text-base leading-relaxed">"{dialogue.content}"</p>
      {dialogue.direction ? (
        <p className="text-muted-foreground text-xs italic">({dialogue.direction})</p>
      ) : null}
    </div>
  );
}

interface NodeTypeBadgeProps {
  type: string;
}

function NodeTypeBadge({ type }: NodeTypeBadgeProps) {
  const variantMap: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    start: "default",
    end: "destructive",
    scene: "secondary",
    choice: "outline",
    condition: "outline",
    merge: "secondary",
  };

  return <Badge variant={variantMap[type] ?? "secondary"}>{type}</Badge>;
}

/* ===================================================================== */
/* Engine Helpers                                                          */
/* ===================================================================== */

function initializeFlagState(
  flags: { id: string; type: string; defaultValue?: string }[],
): Record<string, string | number | boolean> {
  const state: Record<string, string | number | boolean> = {};
  for (const flag of flags) {
    if (flag.type === "boolean") {
      state[flag.id] = flag.defaultValue === "true";
    } else if (flag.type === "number") {
      state[flag.id] = Number(flag.defaultValue ?? "0");
    } else {
      state[flag.id] = flag.defaultValue ?? "";
    }
  }
  return state;
}

function evaluateConditions(
  conditions: {
    type: string;
    flagId?: string;
    operator?: string;
    value?: unknown;
    logic?: string;
    children?: unknown[];
  }[],
  flagState: Record<string, string | number | boolean>,
): boolean {
  if (!conditions || conditions.length === 0) return true;

  for (const cond of conditions) {
    if (!evaluateSingleCondition(cond, flagState)) return false;
  }
  return true;
}

function evaluateSingleCondition(
  cond: {
    type: string;
    flagId?: string;
    operator?: string;
    value?: unknown;
    logic?: string;
    children?: unknown[];
  },
  flagState: Record<string, string | number | boolean>,
): boolean {
  if (cond.type === "group") {
    const children = (cond.children ?? []) as (typeof cond)[];
    if (cond.logic === "OR") {
      return children.length === 0 || children.some((c) => evaluateSingleCondition(c, flagState));
    }
    // AND (default)
    return children.every((c) => evaluateSingleCondition(c, flagState));
  }

  if (cond.type === "flag_check" && cond.flagId) {
    const actual = flagState[cond.flagId];
    const expected = cond.value;
    if (actual === undefined) return false;

    switch (cond.operator) {
      case "==":
        return actual == expected; // intentional loose comparison
      case "!=":
        return actual != expected;
      case ">":
        return Number(actual) > Number(expected);
      case ">=":
        return Number(actual) >= Number(expected);
      case "<":
        return Number(actual) < Number(expected);
      case "<=":
        return Number(actual) <= Number(expected);
      default:
        return true;
    }
  }

  return true;
}

function applyEffects(
  flagState: Record<string, string | number | boolean>,
  effects: { flagId: string; operation: string; value: string | number | boolean }[],
): Record<string, string | number | boolean> {
  const newState = { ...flagState };

  for (const effect of effects) {
    const current = newState[effect.flagId];

    switch (effect.operation) {
      case "set":
        newState[effect.flagId] = effect.value;
        break;
      case "add":
        newState[effect.flagId] = Number(current ?? 0) + Number(effect.value);
        break;
      case "subtract":
        newState[effect.flagId] = Number(current ?? 0) - Number(effect.value);
        break;
      case "toggle":
        newState[effect.flagId] = !current;
        break;
      case "multiply":
        newState[effect.flagId] = Number(current ?? 0) * Number(effect.value);
        break;
      default:
        break;
    }
  }

  return newState;
}
