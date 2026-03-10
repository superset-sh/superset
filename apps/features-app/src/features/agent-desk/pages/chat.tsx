import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@superbuilder/feature-ui/ai/conversation";
import { Message, MessageContent, MessageResponse } from "@superbuilder/feature-ui/ai/message";
import { Actions, Action } from "@superbuilder/feature-ui/ai/actions";
import { Suggestions, Suggestion } from "@superbuilder/feature-ui/ai/suggestion";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  PromptInputProvider,
  usePromptInputController,
} from "@superbuilder/feature-ui/ai/prompt-input";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@superbuilder/feature-ui/shadcn/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superbuilder/feature-ui/shadcn/tooltip";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  File as FileIcon,
  FileText,
  ImageIcon,
  Loader2,
  Plus,
  Presentation,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAtom } from "jotai";
import { PipelinePanel } from "../components/pipeline-panel";
import { StatusBadge } from "../components/status-badge";
import { showTokenUsageAtom } from "../store/agent-settings.atoms";
import { FlowDesigner } from "./flow-designer";
import { Terminal as TerminalPage } from "./terminal";
import { useFiles, useModels, useRemoveFile, useSession, useStreamChat, useUpdateMessageFeedback, useFlowData } from "../hooks";
import { useAnalyze, useCancelExecution, useExecutionStream, useGenerateSpec, useGenerateScreens } from "../hooks";
import { useAnalyzeStream, useGenerateSpecStream, useGenerateScreensStream } from "../hooks";
import { useFileUpload } from "../hooks/use-file-upload";
import type { AnalysisResult, FlowScreen } from "../types";

interface Props {
  sessionId: string;
}

export function Chat({ sessionId }: Props) {
  return (
    <PromptInputProvider>
      <ChatContent sessionId={sessionId} />
    </PromptInputProvider>
  );
}

type ToolPanel = "designer" | "terminal" | null;

function ChatContent({ sessionId }: Props) {
  const navigate = useNavigate();
  const { t } = useFeatureTranslation("agent-desk");
  const { textInput } = usePromptInputController();
  const [selectedModel, setSelectedModel] = useState<string>("claude-opus-4-6");
  const [showTokenUsage, setShowTokenUsage] = useAtom(showTokenUsageAtom);
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel>(null);
  const [terminalAutoStart, setTerminalAutoStart] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    mimeType: string;
    parsedContent: string | null;
    size?: number;
  } | null>(null);

  const { data: session, isLoading } = useSession(sessionId);
  const { data: files } = useFiles(sessionId);
  const { data: flowData } = useFlowData(sessionId);
  const { data: models } = useModels();
  const removeFile = useRemoveFile();
  const { send, abort, isStreaming, streamingContent } = useStreamChat();
  const {
    uploadingFiles,
    fileInputRef,
    openFileDialog,
    handleFileChange,
    handleDrop,
    handleDragOver,
    upload,
    acceptedExtensions,
  } = useFileUpload(sessionId);

  const analyze = useAnalyze();
  const generateSpec = useGenerateSpec();
  const generateScreens = useGenerateScreens();

  // SSE stream hooks (user-initiated actions)
  const analyzeStream = useAnalyzeStream();
  const specStream = useGenerateSpecStream();
  const screenStream = useGenerateScreensStream();

  const {
    execute,
    abort: abortExecution,
    isExecuting,
    events: executionEvents,
    result: executionResult,
    error: executionError,
  } = useExecutionStream();
  const cancelExecution = useCancelExecution();

  // Esc로 스트리밍 중지
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isStreaming) {
        abort();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isStreaming, abort]);

  // 이미지 클립보드 페이스트
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.files;
      if (items && items.length > 0) {
        const imageFiles = Array.from(items).filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length > 0) {
          e.preventDefault();
          upload(imageFiles);
        }
      }
    },
    [upload],
  );

  const analyzeTriggeredRef = useRef(false);
  const screenDesignTriggeredRef = useRef(false);

  // sessionId 변경 시 ref 리셋
  useEffect(() => {
    analyzeTriggeredRef.current = false;
    screenDesignTriggeredRef.current = false;
  }, [sessionId]);

  const shouldAutoAnalyze = useMemo(() => {
    if (!session?.messages || isStreaming) return false;
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg?.role !== "agent") return false;

    const alreadyInPipeline =
      session.status === "analyzing" ||
      session.status === "analyzed" ||
      session.status === "spec_generated" ||
      session.status === "executing" ||
      session.status === "executed" ||
      session.status === "failed";
    if (alreadyInPipeline) return false;

    if (lastMsg.content.includes("[ANALYZE_REQUEST]")) return true;

    // [SCREEN_DESIGN_REQUEST]가 있지만 analysisResult가 없으면 분석 먼저 실행
    if (lastMsg.content.includes("[SCREEN_DESIGN_REQUEST]") && !session.analysisResult) return true;

    // 이전 메시지에 [ANALYZE_REQUEST]가 있고 분석이 완료되지 않은 경우
    const hasAnalyzeRequest = session.messages.some(
      (m) => m.role === "agent" && m.content.includes("[ANALYZE_REQUEST]"),
    );
    if (hasAnalyzeRequest && !session.analysisResult) return true;

    const fallbackPatterns = ["분석을 시작하겠습니다", "Gap 분석을 시작", "분석을 진행하겠습니다"];
    return fallbackPatterns.some((p) => lastMsg.content.includes(p));
  }, [session?.messages, session?.status, session?.analysisResult, isStreaming]);

  useEffect(() => {
    if (!shouldAutoAnalyze || analyzeTriggeredRef.current) return;
    analyzeTriggeredRef.current = true;
    analyze.mutate({ sessionId, model: selectedModel });
  }, [shouldAutoAnalyze, sessionId, selectedModel]);

  // [SCREEN_DESIGN_REQUEST] 마커 자동 감지
  const shouldAutoDesignScreens = useMemo(() => {
    if (!session?.messages || isStreaming) return false;
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg?.role !== "agent") return false;
    // spec_generated 상태에서만 자동 화면 설계 (designing/analyzed 등에서 재시도 방지)
    if (session.status !== "spec_generated") return false;
    // analysisResult가 없으면 화면 설계 불가
    if (!session.analysisResult) return false;
    return lastMsg.content.includes("[SCREEN_DESIGN_REQUEST]");
  }, [session?.messages, session?.status, session?.analysisResult, isStreaming]);

  useEffect(() => {
    if (!shouldAutoDesignScreens || screenDesignTriggeredRef.current) return;
    screenDesignTriggeredRef.current = true;
    generateScreens.mutate(
      { sessionId, model: selectedModel },
      {
        onSuccess: () => {
          setActiveToolPanel("designer");
        },
      },
    );
  }, [shouldAutoDesignScreens, sessionId, selectedModel]);

  const handleSubmit = useCallback(
    ({ text }: { text: string }) => {
      const content = text.trim();
      if (!content || isStreaming) return;
      setOptimisticUserMessage(content);
      send(sessionId, content, selectedModel)
        .catch(() => toast.error(t("sendFailed")))
        .finally(() => setOptimisticUserMessage(null));
    },
    [isStreaming, send, sessionId, selectedModel, t],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false);
      handleDrop(e);
    },
    [handleDrop],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(true);
      handleDragOver(e);
    },
    [handleDragOver],
  );

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  if (isLoading) {
    return <ChatSkeleton />;
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="text-muted-foreground size-8" />
          <p className="text-muted-foreground">{t("sessionNotFound")}</p>
          <Button variant="outline" onClick={() => navigate({ to: "/agent-desk" })}>
            {t("backToList")}
          </Button>
        </div>
      </div>
    );
  }

  const hasMessages = session.messages.length > 0;
  const hasFiles = (files && files.length > 0) || uploadingFiles.length > 0;
  const sessionType = session.type as "customer" | "operator";
  const prompts = sessionType === "customer" ? CUSTOMER_PROMPTS : OPERATOR_PROMPTS;
  const currentModel = (models ?? []).find((m) => m.id === selectedModel);

  return (
    <div className="relative flex h-full">
      {/* Left: Chat (항상 표시) */}
      <div
        className={cn(
          "relative flex flex-col transition-all duration-300",
          activeToolPanel ? "w-[420px] shrink-0 border-r" : "flex-1",
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {isDragOver && <DragOverlay />}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedExtensions}
          onChange={handleFileChange}
          className="hidden"
        />

        <ChatHeader
        title={session.title ?? t("noTitle")}
        subtitle={
          session.type === "customer" ? t("chatSubtitleCustomer") : t("chatSubtitleOperator")
        }
        status={session.status}
        onBack={() => navigate({ to: "/agent-desk" })}
      />

      <Conversation className="flex-1">
        <ConversationContent className={cn("mx-auto gap-6 px-4 py-6", activeToolPanel ? "max-w-full" : "max-w-3xl")}>
          {!hasMessages && !optimisticUserMessage && !isStreaming && (
            <>
              <ConversationEmptyState
                title={t("welcomeTitle")}
                description={
                  sessionType === "customer"
                    ? t("welcomeCustomerDesc")
                    : t("welcomeOperatorDesc")
                }
                icon={<Bot className="size-8" />}
              />
              <Suggestions className="justify-center">
                {prompts.map((prompt) => (
                  <Suggestion
                    key={prompt.key}
                    suggestion={t(prompt.key)}
                    onClick={() => textInput.setInput(t(prompt.text))}
                  />
                ))}
              </Suggestions>
              <p className="text-muted-foreground text-center text-xs">
                <Button
                  variant="link"
                  size="sm"
                  onClick={openFileDialog}
                  className="h-auto p-0 text-xs underline underline-offset-2"
                >
                  {t("uploadOrStart")}
                </Button>
              </p>
            </>
          )}

          {session.messages.map((msg, idx) => {
            const content = msg.content.replace("[ANALYZE_REQUEST]", "").replace("[SCREEN_DESIGN_REQUEST]", "").trim();
            const isUser = msg.role === "user";
            const isLastAssistant =
              msg.role === "agent" && idx === session.messages.length - 1 && !isStreaming;

            return (
              <div key={msg.id} className="group/message">
                <Message from={isUser ? "user" : "assistant"}>
                  <MessageContent>
                    {isUser ? (
                      <p>{content}</p>
                    ) : (
                      <MessageResponse>{content}</MessageResponse>
                    )}
                  </MessageContent>
                </Message>
                <div className="mt-1 flex justify-end">
                  <MessageActionsBar
                    content={content}
                    isAssistant={!isUser}
                    isLastAssistant={isLastAssistant}
                    messageId={msg.id}
                    sessionId={sessionId}
                    initialFeedback={(msg as Record<string, unknown>).feedback as "like" | "dislike" | null}
                    onRegenerate={
                      isLastAssistant
                        ? () => {
                            send(
                              sessionId,
                              session.messages.filter((m) => m.role === "user").pop()?.content ??
                                "",
                              selectedModel,
                            );
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          })}

          {optimisticUserMessage && (
            <Message from="user">
              <MessageContent>
                <p>{optimisticUserMessage}</p>
              </MessageContent>
            </Message>
          )}

          {isStreaming && (
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>
                  {streamingContent.replace("[ANALYZE_REQUEST]", "").replace("[SCREEN_DESIGN_REQUEST]", "")}
                </MessageResponse>
              </MessageContent>
            </Message>
          )}

          {(session.status === "analyzing" ||
            session.status === "analyzed" ||
            session.status === "designing" ||
            session.status === "spec_generated" ||
            session.status === "executing" ||
            session.status === "executed" ||
            session.status === "failed") && (
            <PipelinePanel
              sessionId={sessionId}
              sessionType={sessionType}
              status={session.status}
              analysisResult={session.analysisResult as AnalysisResult | null}
              spec={session.spec}
              executionEvents={executionEvents}
              executionResult={executionResult}
              executionError={executionError}
              isAnalyzing={analyze.isPending || analyzeStream.isAnalyzing}
              isGeneratingSpec={generateSpec.isPending || specStream.isGeneratingSpec}
              isExecuting={isExecuting}
              streamingAnalysisText={analyzeStream.streamingText}
              analysisStage={analyzeStream.stage}
              analysisStageMessage={analyzeStream.stageMessage}
              streamingSpecText={specStream.streamingText}
              specStage={specStream.stage}
              specStageMessage={specStream.stageMessage}
              screenGenStage={screenStream.stage}
              screenGenStageMessage={screenStream.stageMessage}
              streamingScreenText={screenStream.streamingText}
              onGenerateSpec={() => specStream.generateSpec(sessionId, selectedModel)}
              onDesignScreens={async () => {
                await screenStream.generateScreens(sessionId, selectedModel);
                setActiveToolPanel("designer");
              }}
              onExecute={() => {
                setTerminalAutoStart(true);
                setActiveToolPanel("terminal");
              }}
              onOpenTerminal={() => {
                setTerminalAutoStart(false);
                setActiveToolPanel("terminal");
              }}
              onCancel={() => {
                analyzeStream.abort();
                specStream.abort();
                screenStream.abort();
                abortExecution();
                cancelExecution.mutate({ sessionId });
              }}
              hasFlowData={!!session.flowData}
              flowScreens={(flowData?.screens as FlowScreen[]) ?? []}
              onOpenDesigner={() => {
                setActiveToolPanel("designer");
              }}
              onRetry={() => {
                if (session.analysisResult) {
                  execute(sessionId);
                } else {
                  analyze.mutate({ sessionId, model: selectedModel });
                }
              }}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <FileArea
        files={files ?? []}
        uploadingFiles={uploadingFiles}
        onAdd={openFileDialog}
        onRemove={(fileId) => removeFile.mutate({ fileId })}
        onPreview={(file) => setPreviewFile(file)}
        hasFiles={hasFiles}
      />

      <FilePreviewSheet file={previewFile} onClose={() => setPreviewFile(null)} />

      {/* Input area */}
      <div className="bg-background border-t px-4 py-3">
        <div className={cn("mx-auto", activeToolPanel ? "max-w-full" : "max-w-3xl")}>
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              placeholder={isStreaming ? t("sendStreamingPlaceholder") : t("sendPlaceholder")}
              disabled={isStreaming}
              onPaste={handlePaste}
            />
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton onClick={openFileDialog}>
                  <Plus className="size-4" />
                </PromptInputButton>
                <PromptInputSelect
                  value={selectedModel}
                  onValueChange={(v: unknown) => {
                    if (v) setSelectedModel(v as string);
                  }}
                >
                  <PromptInputSelectTrigger className="h-7 w-auto gap-1 px-2 text-sm">
                    <Bot className="text-muted-foreground size-3.5" />
                    <PromptInputSelectValue>
                      {currentModel?.name ?? t("modelSelect")}
                    </PromptInputSelectValue>
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    {(models ?? []).map((model) => (
                      <PromptInputSelectItem key={model.id} value={model.id}>
                        <span>{model.name}</span>
                        {model.isDefault && (
                          <span className="text-muted-foreground ml-2">{t("modelDefault")}</span>
                        )}
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
                <PromptInputButton
                  onClick={() => setShowTokenUsage(!showTokenUsage)}
                  className={cn(showTokenUsage && "text-primary bg-primary/10")}
                  title={showTokenUsage ? t("tokenUsageHide") : t("tokenUsageShow")}
                >
                  <Activity className="size-3.5" />
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit
                status={isStreaming ? "streaming" : "ready"}
                disabled={!isStreaming && !textInput.value.trim()}
                onClick={
                  isStreaming
                    ? (e: React.MouseEvent) => {
                        e.preventDefault();
                        abort();
                      }
                    : undefined
                }
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
      </div>

      {/* Right: Tool Panel (도구가 선택되었을 때 표시) */}
      {activeToolPanel === "designer" && (
        <div className="flex-1 min-w-0">
          <FlowDesigner
            sessionId={sessionId}
            embedded
            onClose={() => setActiveToolPanel(null)}
          />
        </div>
      )}
      {activeToolPanel === "terminal" && (
        <div className="flex-1 min-w-0">
          <TerminalPage
            sessionId={sessionId}
            autoStart={terminalAutoStart}
            embedded
            onClose={() => setActiveToolPanel(null)}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function ChatHeader({
  title,
  subtitle,
  status,
  onBack,
}: {
  title: string;
  subtitle: string;
  status: string;
  onBack: () => void;
}) {
  return (
    <div className="bg-background flex items-center gap-3 border-b px-4 py-3">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="size-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function MessageActionsBar({
  content,
  isAssistant,
  isLastAssistant,
  onRegenerate,
  messageId,
  sessionId,
  initialFeedback = null,
}: {
  content: string;
  isAssistant: boolean;
  isLastAssistant: boolean;
  onRegenerate?: () => void;
  messageId?: string;
  sessionId?: string;
  initialFeedback?: "like" | "dislike" | null;
}) {
  const { t } = useFeatureTranslation("agent-desk");
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(initialFeedback);

  const feedbackMutation = useUpdateMessageFeedback(sessionId ?? "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success(t("copiedToClipboard"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: "like" | "dislike") => {
    const next = feedback === type ? null : type;
    const previous = feedback;
    setFeedback(next);

    if (messageId) {
      feedbackMutation.mutate(
        { messageId, feedback: next },
        { onError: () => setFeedback(previous) },
      );
    }
  };

  return (
    <Actions className="opacity-0 transition-opacity group-hover/message:opacity-100">
      <Action tooltip={t("copyMessage")} onClick={handleCopy}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Action>

      {isAssistant && (
        <>
          {isLastAssistant && onRegenerate ? (
            <Action tooltip={t("regenerateMessage")} onClick={onRegenerate}>
              <RefreshCw className="size-3.5" />
            </Action>
          ) : null}

          <Action
            tooltip={t("likeMessage")}
            onClick={() => handleFeedback("like")}
          >
            <ThumbsUp
              className={cn("size-3.5", feedback === "like" && "fill-current text-foreground")}
            />
          </Action>

          <Action
            tooltip={t("dislikeMessage")}
            onClick={() => handleFeedback("dislike")}
          >
            <ThumbsDown
              className={cn("size-3.5", feedback === "dislike" && "fill-current text-foreground")}
            />
          </Action>
        </>
      )}
    </Actions>
  );
}

interface FileAreaProps {
  files: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    parsedContent: string | null;
    parsedAt: string | null;
    storageUrl?: string;
  }>;
  uploadingFiles: Array<{
    id: string;
    name: string;
    progress: string;
    error?: string;
  }>;
  onAdd: () => void;
  onRemove: (fileId: string) => void;
  onPreview: (file: {
    name: string;
    mimeType: string;
    parsedContent: string | null;
    size?: number;
  }) => void;
  hasFiles: boolean;
}

function FileArea({ files, uploadingFiles, onAdd, onRemove, onPreview, hasFiles }: FileAreaProps) {
  const { t } = useFeatureTranslation("agent-desk");
  if (!hasFiles) return null;

  return (
    <div className="bg-muted/30 border-t px-4 py-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto">
        {files.map((file) => (
          <FileCard
            key={file.id}
            name={file.originalName}
            mimeType={file.mimeType}
            storageUrl={file.storageUrl}
            status={file.parsedContent ? "parsed" : file.parsedAt ? "error" : "pending"}
            onRemove={() => onRemove(file.id)}
            onPreview={
              file.parsedContent
                ? () =>
                    onPreview({
                      name: file.originalName,
                      mimeType: file.mimeType,
                      parsedContent: file.parsedContent,
                      size: file.size,
                    })
                : undefined
            }
          />
        ))}

        {uploadingFiles.map((file) => (
          <FileCard
            key={file.id}
            name={file.name}
            mimeType=""
            status={file.progress as "uploading" | "confirming" | "parsing" | "done" | "error"}
            error={file.error}
          />
        ))}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                onClick={onAdd}
                className="border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground size-10 shrink-0 border-dashed"
              />
            }
          >
            <Plus className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{t("addFile")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function FileCard({
  name,
  mimeType,
  status,
  error,
  storageUrl,
  onRemove,
  onPreview,
}: {
  name: string;
  mimeType: string;
  status: string;
  error?: string;
  storageUrl?: string;
  onRemove?: () => void;
  onPreview?: () => void;
}) {
  const { t } = useFeatureTranslation("agent-desk");
  const isImage = mimeType.startsWith("image/");
  const icon = getFileIcon(mimeType);
  const statusIcon = getStatusIcon(status);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "group bg-background relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 shadow-sm",
              onPreview && "hover:bg-accent/50 cursor-pointer transition-colors",
            )}
            onClick={onPreview}
          />
        }
      >
        {isImage && storageUrl ? (
          <img src={storageUrl} alt={name} className="size-8 shrink-0 rounded object-cover" />
        ) : (
          icon
        )}
        <span className="max-w-[100px] truncate text-sm">{name}</span>
        {statusIcon}

        {onPreview && (
          <Eye className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        )}

        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="bg-muted-foreground text-background hover:bg-foreground absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full group-hover:flex"
          >
            <X className="size-3" />
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {error ? t("fileError", { error }) : onPreview ? t("fileClickToPreview", { name }) : name}
      </TooltipContent>
    </Tooltip>
  );
}

function FilePreviewSheet({
  file,
  onClose,
}: {
  file: { name: string; mimeType: string; parsedContent: string | null; size?: number } | null;
  onClose: () => void;
}) {
  const { t } = useFeatureTranslation("agent-desk");

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const getFileTypeLabel = (mimeType: string) => {
    if (mimeType === "application/pdf") return "PDF";
    if (mimeType.includes("presentationml")) return "PPTX";
    if (mimeType.startsWith("image/")) return t("fileTypeImage");
    if (mimeType === "text/markdown") return "Markdown";
    if (mimeType === "text/plain") return t("fileTypeText");
    return t("fileTypeGeneric");
  };

  return (
    <Sheet
      open={!!file}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {file && getFileIcon(file.mimeType)}
            <span className="truncate">{file?.name}</span>
          </SheetTitle>
          <SheetDescription>
            {file &&
              `${getFileTypeLabel(file.mimeType)}${file.size ? ` · ${formatFileSize(file.size)}` : ""} · ${t("fileParsed")}`}
          </SheetDescription>
        </SheetHeader>
        <div className="bg-muted/20 mt-4 rounded-lg border p-4">
          {file?.parsedContent ? (
            <div className="prose-sm max-w-none text-sm">
              <MessageResponse>{file.parsedContent}</MessageResponse>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("fileNoParsedContent")}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DragOverlay() {
  const { t } = useFeatureTranslation("agent-desk");
  return (
    <div className="border-primary bg-primary/5 absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed">
      <div className="flex flex-col items-center gap-2">
        <Plus className="text-primary size-8" />
        <p className="text-primary text-sm font-medium">{t("dropFiles")}</p>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="bg-muted size-9 animate-pulse rounded-lg" />
        <div className="flex flex-col gap-1.5">
          <div className="bg-muted h-4 w-32 animate-pulse rounded" />
          <div className="bg-muted h-3 w-24 animate-pulse rounded" />
        </div>
      </div>
      <div className="flex-1 px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <div className="flex justify-start">
            <div className="flex gap-2">
              <div className="bg-muted size-7 animate-pulse rounded-full" />
              <div className="bg-muted/60 h-16 w-64 animate-pulse rounded-2xl" />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="bg-muted h-10 w-48 animate-pulse rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <div className="flex gap-2">
              <div className="bg-muted size-7 animate-pulse rounded-full" />
              <div className="bg-muted/60 h-24 w-72 animate-pulse rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

interface PromptSuggestion {
  icon: string;
  key: string;
  text: string;
}

const CUSTOMER_PROMPTS: PromptSuggestion[] = [
  { icon: "\u{1F4C4}", key: "promptRequirements", text: "promptRequirementsText" },
  { icon: "\u{1F50D}", key: "promptCompetitor", text: "promptCompetitorText" },
  { icon: "\u{1F4CA}", key: "promptBusiness", text: "promptBusinessText" },
  { icon: "\u{1F4A1}", key: "promptIdea", text: "promptIdeaText" },
];

const OPERATOR_PROMPTS: PromptSuggestion[] = [
  { icon: "\u{1F4C4}", key: "promptDocAnalysis", text: "promptDocAnalysisText" },
  { icon: "\u{1F5BC}\uFE0F", key: "promptUIAnalysis", text: "promptUIAnalysisText" },
  { icon: "\u{1F4CA}", key: "promptPPT", text: "promptPPTText" },
  { icon: "\u{1F4A1}", key: "promptFeatureDesign", text: "promptFeatureDesignText" },
];

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="text-muted-foreground size-4 shrink-0" />;
  }
  if (mimeType === "application/pdf") {
    return <FileText className="text-destructive size-4 shrink-0" />;
  }
  if (mimeType.includes("presentationml") || mimeType.includes("powerpoint")) {
    return <Presentation className="size-4 shrink-0 text-yellow-600" />;
  }
  if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) {
    return <FileText className="text-primary size-4 shrink-0" />;
  }
  return <FileIcon className="text-muted-foreground size-4 shrink-0" />;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "parsed":
    case "done":
      return <CheckCircle2 className="size-3.5 shrink-0 text-green-600" />;
    case "uploading":
    case "confirming":
    case "parsing":
    case "pending":
      return <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" />;
    case "error":
      return <AlertCircle className="text-destructive size-3.5 shrink-0" />;
    default:
      return null;
  }
}
