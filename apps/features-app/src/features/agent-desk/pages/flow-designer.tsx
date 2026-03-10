import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";

import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superbuilder/feature-ui/shadcn/tooltip";
import { ChatMessage, MarkdownContent } from "@superbuilder/feature-ui/chat/chat-message";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { AlertCircle, Bot, CheckCircle2, Download, FileText, Loader2, RefreshCw, Send, Sparkles, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { DesignerHeader } from "../components/designer-header";
import { DetailPanel } from "../components/detail-panel";
import { FlowCanvas } from "../components/flow-canvas";
import { LinearPublishDialog } from "../components/linear-publish-dialog";
import { MessageActions } from "../components/message-actions";
import { SuggestionCard } from "../components/suggestion-card";
import { HandoffViewer } from "../components/handoff-viewer";
import {
  useSession,
  useMessages,
  useModels,
  useStreamChat,
  useFlowData,
  useUpdateDesignerSettings,
  useCompleteFlowDesign,
  useFlowCanvas,
  useGenerateScreenCandidates,
  useApplyAiSuggestion,
  useGenerateImplementationHandoff,
  useGenerateFlowSpecDraft,
  useAddFlowEdge,
  useDeleteFlowEdge,
  useGenerateScreensStream,
} from "../hooks";
import type { AiSuggestion, FlowEdge, FlowScreen, ImplementationHandoff } from "../types";

interface Props {
  sessionId: string;
  /** 채팅 페이지에 패널로 임베드될 때 true. 자체 채팅 패널과 전체화면 배경을 숨긴다. */
  embedded?: boolean;
  /** embedded 모드에서 패널 닫기 콜백 */
  onClose?: () => void;
}

export function FlowDesigner({ sessionId, embedded = false, onClose }: Props) {
  const navigate = useNavigate();
  const { t } = useFeatureTranslation("agent-desk");
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("claude-opus-4-6");
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"mobile" | "desktop">("mobile");
  const [isSpecOpen, setIsSpecOpen] = useState(false);
  const [isLinearOpen, setIsLinearOpen] = useState(false);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [handoff, setHandoff] = useState<ImplementationHandoff | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: session, isLoading: isSessionLoading } = useSession(sessionId);
  const { data: messages } = useMessages(sessionId);
  const { data: models } = useModels();
  const { data: flowData } = useFlowData(sessionId);
  const { send, abort, isStreaming, streamingContent } = useStreamChat();
  const updateSettings = useUpdateDesignerSettings();
  const completeDesign = useCompleteFlowDesign();
  const generateCandidates = useGenerateScreenCandidates();
  const applyAiSuggestion = useApplyAiSuggestion();
  const generateHandoff = useGenerateImplementationHandoff();
  const generateSpecDraft = useGenerateFlowSpecDraft();
  const addFlowEdge = useAddFlowEdge();
  const deleteFlowEdge = useDeleteFlowEdge();
  const screenStream = useGenerateScreensStream();
  const { panelState, selectNode, selectEdge, closePanel, setDirty, setMode, setActiveTab } = useFlowCanvas();

  const screens: FlowScreen[] = flowData?.screens ?? [];
  const edges: FlowEdge[] = (flowData as Record<string, unknown>)?.edges as FlowEdge[] ?? [];
  const rawPlatform = (session as Record<string, unknown>)?.platform;
  const serverPlatform: "mobile" | "desktop" = rawPlatform === "desktop" ? "desktop" : "mobile";
  const designTheme = String((session as Record<string, unknown>)?.designTheme ?? "");

  // Sync platform from server
  useEffect(() => {
    if (serverPlatform) {
      setPlatform(serverPlatform);
    }
  }, [serverPlatform]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Auto-focus after streaming completes
  useEffect(() => {
    if (!isStreaming) {
      textareaRef.current?.focus();
    }
  }, [isStreaming, sessionId]);

  // Esc to stop streaming
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isStreaming) {
        abort();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isStreaming, abort]);

  // flowData가 없고 designing 상태도 아닌 세션은 일반 세션 페이지로 리다이렉트
  const sessionStatus = (session as Record<string, unknown>)?.status as string | undefined;
  useEffect(() => {
    if (embedded) return; // 패널 모드에서는 리다이렉트하지 않음
    if (session && !flowData?.screens?.length && sessionStatus !== "designing") {
      navigate({ to: "/agent-desk/$sessionId", params: { sessionId } });
    }
  }, [embedded, session, sessionId, sessionStatus, flowData, navigate]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const content = input.trim();
    setInput("");
    setOptimisticUserMessage(content);

    try {
      await send(sessionId, content, selectedModel);
    } catch {
      toast.error(t("sendFailed"));
    } finally {
      setOptimisticUserMessage(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGenerateCandidates = () => {
    generateCandidates.mutate(
      { sessionId },
      {
        onSuccess: () => toast.success("화면 후보가 생성되었습니다"),
        onError: () => toast.error(t("sendFailed")),
      },
    );
  };

  const handleNodeClick = (nodeId: string) => {
    selectNode(nodeId, "view");
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    selectNode(nodeId, "edit");
  };

  const handleEdgeClick = (edgeId: string) => {
    selectEdge(edgeId);
  };

  const handleEdgeDelete = (edgeId: string) => {
    deleteFlowEdge.mutate(
      { sessionId, edgeId },
      {
        onSuccess: () => toast.success("연결이 삭제되었습니다"),
        onError: () => toast.error("연결 삭제에 실패했습니다"),
      },
    );
  };

  const handleEdgeAdd = (sourceId: string, targetId: string) => {
    addFlowEdge.mutate(
      { sessionId, fromScreenId: sourceId, toScreenId: targetId },
      {
        onSuccess: () => toast.success("연결이 추가되었습니다"),
        onError: () => toast.error("연결 추가에 실패했습니다"),
      },
    );
  };

  const handlePlatformChange = (newPlatform: "mobile" | "desktop") => {
    setPlatform(newPlatform); // Optimistic UI update
    updateSettings.mutate({ sessionId, platform: newPlatform });
  };

  const handleDesignThemeChange = (theme: string) => {
    updateSettings.mutate({ sessionId, designTheme: theme });
  };

  const handleApplySuggestion = (suggestionId: string) => {
    applyAiSuggestion.mutate(
      { sessionId, suggestionId, action: "apply" },
      {
        onSuccess: () => {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === suggestionId ? { ...s, status: "applied" as const } : s)),
          );
          toast.success("제안이 적용되었습니다");
        },
        onError: () => toast.error("제안 적용에 실패했습니다"),
      },
    );
  };

  const handleIgnoreSuggestion = (suggestionId: string) => {
    applyAiSuggestion.mutate(
      { sessionId, suggestionId, action: "ignore" },
      {
        onSuccess: () => {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === suggestionId ? { ...s, status: "ignored" as const } : s)),
          );
        },
      },
    );
  };

  const handlePreviewSuggestion = (suggestionId: string) => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (suggestion?.affectedNodeIds[0]) {
      selectNode(suggestion.affectedNodeIds[0], "view");
    }
  };

  const handleGenerateHandoff = () => {
    generateHandoff.mutate(
      { sessionId },
      {
        onSuccess: (data) => {
          setHandoff(data as ImplementationHandoff);
          setIsHandoffOpen(true);
        },
        onError: () => toast.error("인계 패키지 생성에 실패했습니다"),
      },
    );
  };

  const handleGenerateSpecDraft = () => {
    generateSpecDraft.mutate(
      { sessionId },
      {
        onSuccess: (data) => {
          // Refresh handoff data with artifacts included
          const updatedHandoff: ImplementationHandoff = handoff
            ? {
                ...handoff,
                artifacts: {
                  specDraft: data.spec,
                  mermaid: data.diagrams,
                  qaMapping: data.mappings,
                },
              }
            : {
                sessionId,
                generatedAt: new Date().toISOString(),
                routerMap: [],
                screenSpecs: [],
                navigationRules: [],
                implementationNotes: [],
                artifacts: {
                  specDraft: data.spec,
                  mermaid: data.diagrams,
                  qaMapping: data.mappings,
                },
              };
          setHandoff(updatedHandoff);
          setIsHandoffOpen(true);
          toast.success("산출물이 생성되었습니다");
        },
        onError: () => toast.error("산출물 생성에 실패했습니다"),
      },
    );
  };

  const handleBack = () => {
    if (embedded && onClose) {
      onClose();
    } else {
      navigate({ to: "/agent-desk/$sessionId", params: { sessionId } });
    }
  };

  if (isSessionLoading) {
    return <DesignerSkeleton />;
  }

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="text-muted-foreground size-8" />
          <p className="text-muted-foreground">{t("sessionNotFound")}</p>
          <Button variant="outline" onClick={handleBack}>
            {t("backToList")}
          </Button>
        </div>
      </div>
    );
  }


  const messageList = messages ?? [];

  return (
    <div className={cn("flex flex-col bg-muted/20 relative", embedded ? "h-full" : "h-screen")}>
      {/* Sub-tle Canvas Grid Background */}
      {!embedded && (
        <div className="absolute inset-0 max-w-[100vw] overflow-hidden pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMTYxLCAxNjEsIDE3MCwgMC4xNSkiLz48L3N2Zz4=')] [background-size:24px_24px] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wOCkiLz48L3N2Zz4=')] opacity-80" />
      )}
      
      <div className="z-50 relative">
        <DesignerHeader
          title={session.title ?? t("designerTitle")}
          platform={platform}
          designTheme={designTheme}
          onBack={handleBack}
          onPlatformChange={handlePlatformChange}
          onDesignThemeChange={handleDesignThemeChange}
        >
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full shadow-sm"
            onClick={async () => {
              try {
                await screenStream.generateScreens(sessionId, selectedModel);
                toast.success("화면이 재생성되었습니다");
              } catch {
                toast.error("화면 재생성에 실패했습니다");
              }
            }}
            disabled={screenStream.isGeneratingScreens}
          >
            {screenStream.isGeneratingScreens ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            화면 재생성
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full shadow-sm"
            onClick={handleGenerateCandidates}
            disabled={generateCandidates.isPending}
          >
            {generateCandidates.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            화면 후보 생성
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full shadow-sm"
            onClick={handleGenerateHandoff}
            disabled={generateHandoff.isPending || screens.length === 0}
          >
            {generateHandoff.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            구현 인계 생성
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full shadow-sm"
            onClick={handleGenerateSpecDraft}
            disabled={generateSpecDraft.isPending || screens.length === 0}
          >
            {generateSpecDraft.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileText className="mr-2 size-4" />
            )}
            산출물 생성
          </Button>
          {completeDesign.isPending ? (
            <Button size="sm" disabled className="h-8 shadow-sm">
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("completingDesign")}
            </Button>
          ) : session.status === "analyzed" || session.status === "executed" || session.status === "spec_generated" ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-full ring-1 ring-primary/20">
                <CheckCircle2 className="size-4" />
                {t("designCompleted")}
              </div>
              <Dialog open={isSpecOpen} onOpenChange={setIsSpecOpen}>
                <DialogTrigger>
                  <Button variant="outline" size="sm" className="h-8 rounded-full shadow-sm">
                    <FileText className="mr-2 size-4" />
                    {t("viewSpec") || "화면정의서 보기"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>{t("specModalTitle") || "화면정의서 (Specification)"}</DialogTitle>
                    <DialogDescription>
                      {session.title}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto p-4 bg-muted/20 border rounded-md min-h-[400px]">
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      {session.spec ? (
                        <MarkdownContent content={session.spec} />
                      ) : (
                        <p className="text-muted-foreground">{t("noSpecAvailable") || "생성된 화면정의서가 없습니다."}</p>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full shadow-sm"
                onClick={() => setIsLinearOpen(true)}
              >
                <Upload className="mr-2 size-4" />
                Linear 발행
              </Button>
              <LinearPublishDialog
                open={isLinearOpen}
                onOpenChange={setIsLinearOpen}
                sessionId={sessionId}
              />
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                completeDesign.mutate({ sessionId });
                if (session.status !== "executed" && session.status !== "analyzed" && session.status !== "spec_generated") {
                  toast.success(t("designCompleted"));
                }
              }}
              disabled={screens.length === 0}
              className="h-8 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-full"
            >
              {t("completeDesign")}
            </Button>
          )}
        </DesignerHeader>
      </div>

      {/* Workspace Area */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4 z-10 relative">
        {/* Left: Flow Canvas */}
        <div className="flex-1 min-w-[300px] overflow-hidden flex flex-col relative">
          <FlowCanvas
            sessionId={sessionId}
            screens={screens}
            edges={edges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgeClick={handleEdgeClick}
            onEdgeDelete={handleEdgeDelete}
            onEdgeAdd={handleEdgeAdd}
            selectedNodeId={panelState.selectedNodeId}
            selectedEdgeId={panelState.selectedEdgeId}
          />
        </div>

        {/* Center: Detail Panel (conditional) */}
        <DetailPanel
          sessionId={sessionId}
          screens={screens}
          edges={edges}
          panelState={panelState}
          onClose={closePanel}
          onDirtyChange={setDirty}
          onModeChange={setMode}
          onTabChange={setActiveTab}
        />

        {/* Right Panel: Agent Chat (standalone 모드에서만) */}
        {!embedded && (
          <div className="w-[320px] xl:w-[380px] shrink-0 bg-background/80 backdrop-blur-xl rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
            {/* Chat Header */}
            <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4 bg-muted/5 backdrop-blur-md">
              <Bot className="text-primary size-5 drop-shadow-sm" />
              <span className="text-sm font-medium tracking-tight">{t("chatSubtitleDesigner")}</span>
              <div className="flex-1" />
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-6 px-4 py-6">
                {messageList.length === 0 && !optimisticUserMessage && !isStreaming ? (
                  <DesignerEmptyState />
                ) : null}

                {messageList.map((msg, idx) => {
                  const content = msg.content;
                  const variant = msg.role === "user" ? ("user" as const) : ("assistant" as const);
                  const isLastAssistant =
                    msg.role === "agent" && idx === messageList.length - 1 && !isStreaming;

                  return (
                    <div key={msg.id} className="group/message">
                      <ChatMessage
                        content={content}
                        variant={variant}
                        showAvatar={msg.role !== "user"}
                      />
                      <div className="mt-1 flex justify-end">
                        <MessageActions
                          content={content}
                          variant={variant}
                          isLastAssistant={isLastAssistant}
                          messageId={msg.id}
                          sessionId={sessionId}
                          initialFeedback={(msg as Record<string, unknown>).feedback as "like" | "dislike" | null}
                          onRegenerate={
                            isLastAssistant
                              ? () => {
                                  const lastUserMsg = messageList
                                    .filter((m) => m.role === "user")
                                    .pop();
                                  if (lastUserMsg) {
                                    send(sessionId, lastUserMsg.content, selectedModel);
                                  }
                                }
                              : undefined
                          }
                        />
                      </div>
                      {/* AI Suggestion Cards after agent messages */}
                      {msg.role === "agent" && suggestions.length > 0 && idx === messageList.length - 1 ? (
                        <div className="mt-3 flex flex-col gap-2">
                          {suggestions.map((suggestion) => (
                            <SuggestionCard
                              key={suggestion.id}
                              suggestion={suggestion}
                              onApply={handleApplySuggestion}
                              onIgnore={handleIgnoreSuggestion}
                              onPreview={handlePreviewSuggestion}
                              isApplying={applyAiSuggestion.isPending}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {optimisticUserMessage ? (
                  <ChatMessage content={optimisticUserMessage} variant="user" showAvatar={false} />
                ) : null}

                {isStreaming ? (
                  <ChatMessage content={streamingContent} variant="assistant" isStreaming />
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 relative z-20">
              <div className="relative rounded-2xl border border-border/50 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 bg-background overflow-hidden p-1.5 transition-all">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? t("sendStreamingPlaceholder") : t("sendPlaceholder")}
                  disabled={isStreaming}
                  className="max-h-[200px] min-h-[44px] resize-none border-0 shadow-none focus-visible:ring-0 p-3 pr-12"
                  rows={1}
                />

                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  {isStreaming ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-8 animate-pulse rounded-full"
                            onClick={abort}
                          />
                        }
                      >
                        <Square className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{t("stopButton")}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon"
                            className={cn("size-8 rounded-full transition-colors", !input.trim() ? "opacity-50" : "bg-primary text-primary-foreground")}
                            onClick={handleSend}
                            disabled={!input.trim()}
                          />
                        }
                      >
                        <Send className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{t("sendButton")}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              <div className="mt-2 flex justify-between items-center px-1">
                <ChatModelSelector
                  models={models ?? []}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Handoff Viewer Dialog */}
      <Dialog open={isHandoffOpen} onOpenChange={setIsHandoffOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>구현 인계 패키지</DialogTitle>
            <DialogDescription>{session.title}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden min-h-[400px]">
            {handoff ? <HandoffViewer handoff={handoff} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function DesignerEmptyState() {
  const { t } = useFeatureTranslation("agent-desk");

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center fade-in zoom-in duration-300">
      <div className="bg-primary/10 flex size-14 items-center justify-center rounded-2xl">
        <Bot className="text-primary size-7" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">{t("designerTitle")}</p>
        <p className="text-muted-foreground text-sm max-w-[250px] mx-auto">{t("designerSubtitle")}</p>
      </div>
    </div>
  );
}

function ChatModelSelector({
  models,
  selectedModel,
  onModelChange,
}: {
  models: Array<{ id: string; name: string; provider: string; isDefault: boolean }>;
  selectedModel: string;
  onModelChange: (model: string) => void;
}) {
  const { t } = useFeatureTranslation("agent-desk");
  if (models.length === 0) return null;

  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <div className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
      <Bot className="text-muted-foreground size-3.5 shrink-0" />
      <Select
        value={selectedModel}
        onValueChange={(v) => {
          if (v) onModelChange(v);
        }}
      >
        <SelectTrigger className="text-muted-foreground hover:text-foreground h-6 w-auto gap-1 border-none bg-transparent p-0 text-xs shadow-none">
          <SelectValue>{currentModel?.name ?? t("modelSelect")}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <span>{model.name}</span>
              {model.isDefault ? (
                <span className="text-muted-foreground ml-2 text-xs">{t("modelDefault")}</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DesignerSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <div className="flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur px-4">
        <div className="bg-muted size-9 animate-pulse rounded-full" />
        <div className="bg-muted h-5 w-40 animate-pulse rounded" />
      </div>
      <div className="flex flex-1 p-6 gap-6 overflow-hidden relative z-10">
        <div className="w-[300px] rounded-2xl border border-border/50 bg-background/80 backdrop-blur p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="bg-muted h-6 w-24 animate-pulse rounded mb-2" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-muted h-12 w-full animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="bg-muted h-[600px] w-full max-w-[375px] animate-pulse rounded-[3rem] shadow-sm border border-border/50" />
        </div>
        <div className="w-[450px] rounded-2xl border border-border/50 bg-background/80 backdrop-blur flex flex-col shadow-sm">
          <div className="h-[60px] border-b border-border/50 bg-muted/5 animate-pulse" />
          <div className="flex-1 p-6 flex flex-col gap-4">
            <div className="bg-muted h-20 w-3/4 animate-pulse rounded-2xl rounded-tl-sm" />
            <div className="bg-muted h-12 w-1/2 animate-pulse self-end rounded-2xl rounded-tr-sm" />
            <div className="bg-muted h-24 w-2/3 animate-pulse rounded-2xl rounded-tl-sm" />
          </div>
          <div className="h-24 border-t p-4">
            <div className="bg-muted h-12 w-full animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
