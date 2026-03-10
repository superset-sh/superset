/**
 * ProjectList - 스토리 스튜디오 프로젝트 목록
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, FolderPlus, MoreVertical, Trash2 } from "lucide-react";
import { ProjectRow } from "../components/project-row";
import { useCreateProject, useDeleteProject, useProjects } from "../hooks";

export function ProjectList() {
  const { data: projects, isLoading, error } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = () => {
    if (!title.trim()) return;
    createProject.mutate(
      {
        title: title.trim(),
        genre: genre.trim() || undefined,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetForm();
        },
      },
    );
  };

  const resetForm = () => {
    setTitle("");
    setGenre("");
    setDescription("");
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("정말 삭제하시겠습니까?")) {
      deleteProject.mutate({ id });
    }
  };

  const handleCardClick = (id: string) => {
    navigate({ to: "/story-studio/$id", params: { id } });
  };

  if (isLoading) {
    return <ProjectListSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive">프로젝트를 불러오는 중 오류가 발생했습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">스토리 스튜디오</h1>
          <p className="text-muted-foreground mt-1">인터랙티브 스토리 프로젝트를 관리합니다.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <FolderPlus className="mr-2 h-4 w-4" />새 프로젝트
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 프로젝트 생성</DialogTitle>
              <DialogDescription>
                인터랙티브 스토리 프로젝트의 기본 정보를 입력하세요.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">프로젝트 제목</Label>
                <Input
                  id="title"
                  placeholder="예: 마법사의 여정"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genre">장르</Label>
                <Input
                  id="genre"
                  placeholder="예: 판타지, SF, 로맨스"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">설명</Label>
                <Textarea
                  id="desc"
                  placeholder="프로젝트에 대한 간략한 설명"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
              >
                취소
              </Button>
              <Button onClick={handleCreate} disabled={!title.trim() || createProject.isPending}>
                {createProject.isPending ? "생성 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Project Grid */}
      {!projects || projects.length === 0 ? (
        <EmptyState onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div className="flex flex-col">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group/row hover:bg-muted/50 flex items-center rounded-md pr-2 transition-colors"
            >
              <ProjectRow
                project={project}
                className="flex-1 hover:bg-transparent"
                onClick={() => handleCardClick(project.id)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 transition-opacity group-hover/row:opacity-100"
                    />
                  }
                >
                  <MoreVertical className="text-muted-foreground h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                    onClick={(e) => handleDelete(project.id, e)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    프로젝트 삭제
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Components */

interface EmptyStateProps {
  onCreateClick: () => void;
}

function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <BookOpen className="text-muted-foreground mb-4 h-12 w-12" />
      <h3 className="text-lg font-semibold">프로젝트가 없습니다</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        새 프로젝트를 만들어 인터랙티브 스토리를 시작해보세요.
      </p>
      <Button className="mt-4" onClick={onCreateClick}>
        <FolderPlus className="mr-2 h-4 w-4" />첫 프로젝트 만들기
      </Button>
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-2 h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
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
