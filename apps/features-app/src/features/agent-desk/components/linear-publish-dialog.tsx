import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { usePreviewLinearIssues, useCreateLinearIssues } from "../hooks";
import type {
  PreviewLinearIssuesResult,
  CreateLinearIssuesResult,
  LinearIssueDraft,
  LinearIssueRef,
} from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}

export function LinearPublishDialog({ open, onOpenChange, sessionId }: Props) {
  const [step, setStep] = useState<"preview" | "result">("preview");
  const [preview, setPreview] = useState<PreviewLinearIssuesResult | null>(null);
  const [result, setResult] = useState<CreateLinearIssuesResult | null>(null);

  const previewMutation = usePreviewLinearIssues();
  const createMutation = useCreateLinearIssues();

  const handlePreview = () => {
    previewMutation.mutate(
      {
        sessionId,
        handoffVersion: 1,
        teamKey: "default",
        storyIds: ["all"],
        groupingMode: "story-to-issue",
        includeSubIssues: true,
      },
      {
        onSuccess: (data) => {
          setPreview(data as PreviewLinearIssuesResult);
          setStep("preview");
        },
        onError: (err) => {
          toast.error(err.message ?? "Draft 생성에 실패했습니다.");
        },
      },
    );
  };

  const handleCreate = () => {
    if (!preview) return;
    createMutation.mutate(
      {
        sessionId,
        publishJobId: preview.publishJobId,
        draftKey: preview.draftKey,
        createSubIssues: true,
      },
      {
        onSuccess: (data) => {
          setResult(data as CreateLinearIssuesResult);
          setStep("result");
          toast.success("Linear 이슈가 생성되었습니다.");
        },
        onError: (err) => {
          toast.error(err.message ?? "이슈 생성에 실패했습니다.");
        },
      },
    );
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation
    setTimeout(() => {
      setStep("preview");
      setPreview(null);
      setResult(null);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Linear 이슈 발행</DialogTitle>
          <DialogDescription>
            구현 핸드오프 데이터를 Linear 이슈로 변환합니다.
          </DialogDescription>
        </DialogHeader>

        {step === "preview" && !preview ? (
          <PreviewEmpty
            onGenerate={handlePreview}
            isLoading={previewMutation.isPending}
          />
        ) : null}

        {step === "preview" && preview ? (
          <PreviewContent
            preview={preview}
            onCreate={handleCreate}
            isCreating={createMutation.isPending}
          />
        ) : null}

        {step === "result" && result ? (
          <ResultContent result={result} onClose={handleClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* Components */

function PreviewEmpty({
  onGenerate,
  isLoading,
}: {
  onGenerate: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <Send className="text-primary size-7" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Linear 이슈 Draft 생성</p>
        <p className="text-muted-foreground mt-1 text-sm">
          핸드오프 데이터를 기반으로 Linear 이슈를 미리 확인합니다.
        </p>
      </div>
      <Button onClick={onGenerate} disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            생성 중...
          </>
        ) : (
          "Draft 생성"
        )}
      </Button>
    </div>
  );
}

function PreviewContent({
  preview,
  onCreate,
  isCreating,
}: {
  preview: PreviewLinearIssuesResult;
  onCreate: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {preview.warnings.length > 0 ? (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-50 p-3 dark:bg-yellow-950/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 text-yellow-600 dark:text-yellow-400" />
            <div className="text-sm">
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-yellow-800 dark:text-yellow-300">
                  {w}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {preview.project ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">프로젝트:</span>
          <Badge variant="secondary">{preview.project.name}</Badge>
        </div>
      ) : null}

      <ScrollArea className="max-h-[400px]">
        <div className="flex flex-col gap-3">
          {preview.issues.map((issue) => (
            <IssueDraftCard key={issue.storyId} issue={issue} />
          ))}
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCreate} disabled={isCreating}>
          {isCreating ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              생성 중...
            </>
          ) : (
            <>
              <Send className="mr-2 size-4" />
              Linear에 발행
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function IssueDraftCard({ issue }: { issue: LinearIssueDraft }) {
  const [expanded, setExpanded] = useState(false);
  const priorityLabels: Record<number, string> = {
    0: "None",
    1: "Urgent",
    2: "High",
    3: "Medium",
    4: "Low",
  };

  return (
    <div className="rounded-lg border p-3">
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{issue.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {priorityLabels[issue.priority] ?? "Medium"}
            </Badge>
            {issue.subIssues && issue.subIssues.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {issue.subIssues.length}개 하위 이슈
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 pl-6">
          <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6 bg-muted/30 rounded p-2">
            {issue.body.slice(0, 500)}
            {issue.body.length > 500 ? "..." : ""}
          </div>
          {issue.subIssues && issue.subIssues.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                하위 이슈:
              </p>
              {issue.subIssues.map((sub) => (
                <div
                  key={sub.taskId}
                  className="text-xs text-muted-foreground pl-2 border-l-2 border-border py-0.5"
                >
                  {sub.title}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultContent({
  result,
  onClose,
}: {
  result: CreateLinearIssuesResult;
  onClose: () => void;
}) {
  const hasFailures = result.failedIssues.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg p-4",
          hasFailures
            ? "bg-yellow-50 dark:bg-yellow-950/20"
            : "bg-green-50 dark:bg-green-950/20",
        )}
      >
        {hasFailures ? (
          <AlertCircle className="size-5 text-yellow-600 dark:text-yellow-400" />
        ) : (
          <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
        )}
        <div>
          <p className="text-sm font-medium">
            {hasFailures
              ? `${result.createdIssues.length}개 생성, ${result.failedIssues.length}개 실패`
              : `${result.createdIssues.length}개 이슈가 성공적으로 생성되었습니다.`}
          </p>
          {result.deduplicated ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              이전에 생성된 이슈가 재사용되었습니다.
            </p>
          ) : null}
        </div>
      </div>

      {result.createdIssues.length > 0 ? (
        <ScrollArea className="max-h-[300px]">
          <div className="flex flex-col gap-2">
            {result.createdIssues.map((issue) => (
              <CreatedIssueRow key={issue.linearIssueId} issue={issue} />
            ))}
          </div>
        </ScrollArea>
      ) : null}

      {result.failedIssues.length > 0 ? (
        <div className="rounded-md border border-destructive/30 p-3">
          <p className="text-sm font-medium text-destructive mb-2">
            실패한 이슈:
          </p>
          {result.failedIssues.map((f, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {f.storyId}: {f.error}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}

function CreatedIssueRow({ issue }: { issue: LinearIssueRef }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant="outline" className="shrink-0 text-xs">
          {issue.identifier}
        </Badge>
        <span className="text-sm truncate">{issue.title}</span>
        {issue.type === "sub-issue" ? (
          <Badge variant="secondary" className="text-xs shrink-0">
            sub
          </Badge>
        ) : null}
      </div>
      {issue.url ? (
        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
        >
          <ExternalLink className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
