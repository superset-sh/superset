/**
 * ProjectDashboard - 프로젝트 대시보드 (챕터 관리)
 */
import { useState } from "react";
import type { ProjectValidationResult } from "@superbuilder/features-server/story-studio";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Crown,
  Download,
  Flag,
  Info,
  Layers,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { ChapterRow } from "../components/chapter-row";
import {
  useChapters,
  useCreateChapter,
  useDeleteChapter,
  useExportProject,
  useProject,
  useUpdateProject,
  useValidateProject,
} from "../hooks";

export function ProjectDashboard() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: chapters, isLoading: chaptersLoading } = useChapters(projectId);
  const exportQuery = useExportProject(projectId);
  const validateQuery = useValidateProject(projectId);
  const updateProject = useUpdateProject();
  const createChapter = useCreateChapter();
  const deleteChapter = useDeleteChapter(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<ProjectValidationResult | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterCode, setChapterCode] = useState("");
  const [chapterSummary, setChapterSummary] = useState("");

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const isLoading = projectLoading || chaptersLoading;

  const handleCreateChapter = () => {
    if (!chapterTitle.trim() || !chapterCode.trim()) return;
    createChapter.mutate(
      {
        projectId,
        title: chapterTitle.trim(),
        code: chapterCode.trim(),
        summary: chapterSummary.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetChapterForm();
        },
      },
    );
  };

  const resetChapterForm = () => {
    setChapterTitle("");
    setChapterCode("");
    setChapterSummary("");
  };

  const handleTitleEdit = () => {
    setTitleDraft(project?.title ?? "");
    setEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (!titleDraft.trim() || !project) return;
    updateProject.mutate({ id: project.id, data: { title: titleDraft.trim() } });
    setEditingTitle(false);
  };

  const handleExport = async () => {
    const { data } = await exportQuery.refetch();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.title ?? "project"}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleValidate = async () => {
    const { data } = await validateQuery.refetch();
    if (data) {
      setValidationResult(data);
    }
  };

  const handleDeleteChapter = (chId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("이 챕터를 삭제하시겠습니까?")) {
      deleteChapter.mutate({ id: chId });
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive">프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back + Project Header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/story-studio" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          프로젝트 목록
        </Button>

        <div className="flex items-start justify-between">
          <div className="space-y-1">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleSave();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  className="text-2xl font-bold"
                  autoFocus
                />
                <Button size="sm" onClick={handleTitleSave}>
                  저장
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">{project.title}</h1>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleTitleEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex items-center gap-3">
              {project.genre ? <Badge variant="outline">{project.genre}</Badge> : null}
              <StatusBadge status={project.status} />
            </div>
            {project.description ? (
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{project.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Quick Nav */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/story-studio/$id/flags", params: { id: projectId } })}
        >
          <Flag className="mr-1 h-4 w-4" />
          플래그
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({ to: "/story-studio/$id/characters", params: { id: projectId } })
          }
        >
          <Users className="mr-1 h-4 w-4" />
          캐릭터
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/story-studio/$id/beats", params: { id: projectId } })}
        >
          <LayoutGrid className="mr-1 h-4 w-4" />
          비트 보드
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/story-studio/$id/endings", params: { id: projectId } })}
        >
          <Crown className="mr-1 h-4 w-4" />
          엔딩
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/story-studio/$id/events", params: { id: projectId } })}
        >
          <Zap className="mr-1 h-4 w-4" />
          이벤트
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/story-studio/$id/preview", params: { id: projectId } })}
        >
          <Play className="mr-1 h-4 w-4" />
          미리보기
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleValidate}
          disabled={validateQuery.isFetching}
        >
          <ShieldCheck className="mr-1 h-4 w-4" />
          {validateQuery.isFetching ? "검증 중..." : "그래프 검증"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exportQuery.isFetching}
        >
          <Download className="mr-1 h-4 w-4" />
          {exportQuery.isFetching ? "내보내기 중..." : "JSON 내보내기"}
        </Button>
      </div>

      {/* Validation Results */}
      {validationResult ? (
        <ValidationPanel result={validationResult} onDismiss={() => setValidationResult(null)} />
      ) : null}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>챕터 수</CardDescription>
            <CardTitle className="text-2xl">{chapters?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>상태</CardDescription>
            <CardTitle className="text-2xl capitalize">
              {project.status === "active" ? "진행 중" : "보관"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>장르</CardDescription>
            <CardTitle className="text-2xl">{project.genre ?? "미지정"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Chapters Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">챕터</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" />새 챕터
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 챕터 추가</DialogTitle>
                <DialogDescription>챕터의 기본 정보를 입력하세요.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="ch-title">챕터 제목</Label>
                  <Input
                    id="ch-title"
                    placeholder="예: 프롤로그"
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ch-code">코드</Label>
                  <Input
                    id="ch-code"
                    placeholder="예: CH01"
                    value={chapterCode}
                    onChange={(e) => setChapterCode(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ch-summary">요약</Label>
                  <Textarea
                    id="ch-summary"
                    placeholder="챕터 요약을 입력하세요"
                    value={chapterSummary}
                    onChange={(e) => setChapterSummary(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false);
                    resetChapterForm();
                  }}
                >
                  취소
                </Button>
                <Button
                  onClick={handleCreateChapter}
                  disabled={!chapterTitle.trim() || !chapterCode.trim() || createChapter.isPending}
                >
                  {createChapter.isPending ? "추가 중..." : "추가"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!chapters || chapters.length === 0 ? (
          <Card className="py-12 text-center">
            <CardContent>
              <Layers className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
              <p className="text-muted-foreground">챕터가 없습니다</p>
              <p className="text-muted-foreground mt-1 text-sm">첫 번째 챕터를 추가해보세요.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col">
            {chapters.map((chapter, idx) => (
              <div
                key={chapter.id}
                className="group/row hover:bg-muted/50 flex items-center rounded-md pr-2 transition-colors"
              >
                <ChapterRow
                  chapter={{
                    id: chapter.id,
                    title: chapter.title,
                    code: chapter.code,
                    status: chapter.status,
                  }}
                  projectId={projectId}
                  index={idx}
                  className="flex-1 hover:bg-transparent"
                  onClick={() =>
                    navigate({
                      to: "/story-studio/$id/chapters/$chId",
                      params: { id: projectId, chId: chapter.id },
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 transition-opacity group-hover/row:opacity-100"
                  onClick={(e) => handleDeleteChapter(chapter.id, e)}
                >
                  <Trash2 className="text-muted-foreground h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Components */

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const variantMap: Record<string, "default" | "secondary" | "outline"> = {
    draft: "secondary",
    active: "default",
    archived: "outline",
  };

  const labelMap: Record<string, string> = {
    draft: "초안",
    active: "진행 중",
    archived: "보관",
  };

  return <Badge variant={variantMap[status] ?? "secondary"}>{labelMap[status] ?? status}</Badge>;
}

interface ValidationPanelProps {
  result: ProjectValidationResult;
  onDismiss: () => void;
}

function ValidationPanel({ result, onDismiss }: ValidationPanelProps) {
  const totalIssues = result.chapters.reduce((sum, ch) => sum + ch.issues.length, 0);
  const errorCount = result.chapters.reduce(
    (sum, ch) => sum + ch.issues.filter((i) => i.severity === "error").length,
    0,
  );
  const warningCount = result.chapters.reduce(
    (sum, ch) => sum + ch.issues.filter((i) => i.severity === "warning").length,
    0,
  );

  const isValid = errorCount === 0;

  return (
    <Card className={isValid ? "border-green-500/50" : "border-destructive/50"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isValid ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="text-destructive h-5 w-5" />
            )}
            <CardTitle className="text-base">
              {isValid ? "검증 통과" : `${errorCount}개 오류 발견`}
            </CardTitle>
            {warningCount > 0 ? (
              <Badge variant="outline" className="text-xs">
                경고 {warningCount}건
              </Badge>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            닫기
          </Button>
        </div>
        {totalIssues === 0 ? (
          <CardDescription>모든 챕터의 그래프가 정상입니다.</CardDescription>
        ) : null}
      </CardHeader>
      {totalIssues > 0 ? (
        <CardContent className="space-y-3 pt-0">
          {result.chapters
            .filter((ch) => ch.issues.length > 0)
            .map((ch) => (
              <div key={ch.chapterId} className="space-y-1">
                <p className="text-sm font-medium">{ch.chapterTitle}</p>
                <ul className="space-y-1">
                  {ch.issues.map((issue, idx) => (
                    <li key={idx} className="text-muted-foreground flex items-start gap-2 text-sm">
                      <SeverityIcon severity={issue.severity} />
                      <span>
                        <span className="text-muted-foreground/60 mr-1 font-mono text-xs">
                          [{issue.code}]
                        </span>
                        {issue.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "error":
      return <AlertTriangle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" />;
    case "warning":
      return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />;
    default:
      return <Info className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />;
  }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-12" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border px-4 py-3">
            <Skeleton className="size-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
