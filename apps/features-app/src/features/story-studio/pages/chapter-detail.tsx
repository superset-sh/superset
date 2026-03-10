/**
 * ChapterDetail - 챕터 상세 편집 및 네비게이션
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Flag, GitBranch, Save, Users } from "lucide-react";
import { useChapter, useUpdateChapter } from "../hooks";

export function ChapterDetail() {
  const { id, chId } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";
  const chapterId = chId ?? "";

  const { data: chapter, isLoading } = useChapter(chapterId);
  const updateChapter = useUpdateChapter();

  const [title, setTitle] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Use draft values if editing, otherwise fall back to server data
  const displayTitle = title ?? chapter?.title ?? "";
  const displayCode = code ?? chapter?.code ?? "";
  const displaySummary = summary ?? chapter?.summary ?? "";
  const displayStatus = status ?? chapter?.status ?? "outline";

  const isDirty = title !== null || code !== null || summary !== null || status !== null;

  const handleSave = () => {
    if (!chapterId) return;

    const data: Record<string, string | undefined> = {};
    if (title !== null) data.title = title;
    if (code !== null) data.code = code;
    if (summary !== null) data.summary = summary;
    if (status !== null) data.status = status;

    updateChapter.mutate(
      { id: chapterId, data },
      {
        onSuccess: () => {
          setTitle(null);
          setCode(null);
          setSummary(null);
          setStatus(null);
        },
      },
    );
  };

  if (isLoading) {
    return <ChapterDetailSkeleton />;
  }

  if (!chapter) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive">챕터를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back Navigation */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/story-studio/$id", params: { id: projectId } })}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        프로젝트 대시보드
      </Button>

      {/* Chapter Info */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{chapter.title}</h1>
          {isDirty ? (
            <Button onClick={handleSave} disabled={updateChapter.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {updateChapter.isPending ? "저장 중..." : "변경사항 저장"}
            </Button>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">챕터 정보</CardTitle>
            <CardDescription>챕터의 기본 정보를 편집합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ch-title">제목</Label>
                <Input
                  id="ch-title"
                  value={displayTitle}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ch-code">코드</Label>
                <Input id="ch-code" value={displayCode} onChange={(e) => setCode(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ch-status">상태</Label>
              <Select value={displayStatus} onValueChange={(val) => setStatus(val)}>
                <SelectTrigger id="ch-status" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outline">개요</SelectItem>
                  <SelectItem value="draft">초안</SelectItem>
                  <SelectItem value="review">검토</SelectItem>
                  <SelectItem value="final">최종</SelectItem>
                  <SelectItem value="locked">잠금</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ch-summary">요약</Label>
              <Textarea
                id="ch-summary"
                value={displaySummary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                placeholder="이 챕터의 줄거리를 요약해주세요"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Buttons */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">작업 공간</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NavCard
            icon={<GitBranch className="h-5 w-5" />}
            title="선택지 그래프"
            description="씬과 선택지 분기를 시각적으로 편집합니다."
            onClick={() =>
              navigate({
                to: "/story-studio/$id/chapters/$chId/graph",
                params: { id: projectId, chId: chapterId },
              })
            }
          />
          <NavCard
            icon={<Flag className="h-5 w-5" />}
            title="플래그"
            description="프로젝트 전역 플래그를 관리합니다."
            onClick={() =>
              navigate({
                to: "/story-studio/$id/flags",
                params: { id: projectId },
              })
            }
          />
          <NavCard
            icon={<Users className="h-5 w-5" />}
            title="캐릭터"
            description="등장인물 정보를 관리합니다."
            onClick={() =>
              navigate({
                to: "/story-studio/$id/characters",
                params: { id: projectId },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

/* Components */

interface NavCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

function NavCard({ icon, title, description, onClick }: NavCardProps) {
  return (
    <Card className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={onClick}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="text-primary">{icon}</div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

function ChapterDetailSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-9 w-64" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
