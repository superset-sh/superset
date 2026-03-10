import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Plus, FolderOpen } from "lucide-react";
import { useStudios, useStudioMutations } from "../hooks";

interface Props {}

export function StudioListPage({}: Props) {
  const navigate = useNavigate();
  const { data: studios, isLoading } = useStudios();
  const { createStudio } = useStudioMutations();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = () => {
    if (!title.trim()) return;
    createStudio.mutate(
      { title: title.trim(), description: description.trim() || undefined },
      {
        onSuccess: (studio) => {
          setOpen(false);
          setTitle("");
          setDescription("");
          navigate({ to: "/content-studio/$studioId", params: { studioId: studio.id } });
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        title="콘텐츠 스튜디오"
        description="콘텐츠를 시각적으로 관리하세요"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              새 스튜디오
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 스튜디오 만들기</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Input
                  placeholder="스튜디오 이름"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Textarea
                  placeholder="설명 (선택)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
                <Button onClick={handleCreate} disabled={createStudio.isPending || !title.trim()}>
                  만들기
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : studios?.length === 0 ? (
        <EmptyState onCreateClick={() => setOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {studios?.map((studio) => (
            <StudioCard
              key={studio.id}
              studio={studio}
              onClick={() =>
                navigate({ to: "/content-studio/$studioId", params: { studioId: studio.id } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FolderOpen className="size-12 text-muted-foreground/50 mb-4" />
      <p className="text-lg font-medium">아직 스튜디오가 없습니다</p>
      <p className="text-sm text-muted-foreground mt-1">
        새 스튜디오를 만들어 콘텐츠를 관리해보세요
      </p>
      <Button className="mt-6" onClick={onCreateClick}>
        <Plus className="size-4" />
        첫 스튜디오 만들기
      </Button>
    </div>
  );
}

interface StudioCardProps {
  studio: {
    id: string;
    title: string;
    description: string | null;
    ownerName: string | null;
    visibility: string;
    createdAt: string | Date | null;
  };
  onClick: () => void;
}

function StudioCard({ studio, onClick }: StudioCardProps) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onClick}
    >
      <CardContent className="p-6">
        <h3 className="text-lg font-medium">{studio.title}</h3>
        {studio.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {studio.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span>{studio.ownerName}</span>
          {studio.createdAt && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>
                {new Date(studio.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
