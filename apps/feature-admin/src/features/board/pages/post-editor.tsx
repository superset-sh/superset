/**
 * PostEditor - 게시물 작성/수정 폼
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { ArrowLeft, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { useCreatePost, useUpdatePost, usePost } from "../hooks";

interface PostEditorProps {
  boardId: string;
  boardSlug: string;
  postId?: string; // 수정 모드일 때
}

export function PostEditor({ boardId, boardSlug, postId }: PostEditorProps) {
  const navigate = useNavigate();
  const isEditMode = !!postId;

  // 수정 모드일 때 기존 데이터 로드
  const { data: existingPost, isLoading: isLoadingPost } = usePost(postId ?? "");

  const [title, setTitle] = useState(existingPost?.title ?? "");
  const [content, setContent] = useState(existingPost?.content ?? "");
  const [isPinned, setIsPinned] = useState(existingPost?.isPinned ?? false);
  const [isNotice, setIsNotice] = useState(existingPost?.isNotice ?? false);

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();

  // 기존 데이터 로드 후 상태 업데이트
  useState(() => {
    if (existingPost) {
      setTitle(existingPost.title);
      setContent(existingPost.content);
      setIsPinned(existingPost.isPinned);
      setIsNotice(existingPost.isNotice);
    }
  });

  const handleSubmit = async (status: "draft" | "published") => {
    if (!title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    if (!content.trim()) {
      toast.error("내용을 입력해주세요.");
      return;
    }

    try {
      if (isEditMode && postId) {
        await updatePost.mutateAsync({
          id: postId,
          data: { title, content, status, isPinned, isNotice },
        });
        toast.success("게시물이 수정되었습니다.");
        navigate({ to: `/board/${boardSlug}/${postId}` as "/" });
      } else {
        const created = await createPost.mutateAsync({
          boardId,
          title,
          content,
          status,
          isPinned,
          isNotice,
        });
        toast.success(status === "published" ? "게시물이 등록되었습니다." : "임시 저장되었습니다.");
        navigate({ to: `/board/${boardSlug}/${created.id}` as "/" });
      }
    } catch (err) {
      toast.error("저장에 실패했습니다.");
    }
  };

  if (isEditMode && isLoadingPost) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: `/board/${boardSlug}` as "/" })}
          >
            <ArrowLeft className="mr-2 size-4" />
            취소
          </Button>
          <CardTitle>{isEditMode ? "게시물 수정" : "새 글 작성"}</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 제목 */}
        <div className="space-y-2">
          <Label htmlFor="title">제목</Label>
          <Input
            id="title"
            placeholder="제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* 본문 */}
        <div className="space-y-2">
          <Label htmlFor="content">내용</Label>
          <Textarea
            id="content"
            placeholder="내용을 입력하세요"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[300px]"
          />
        </div>

        {/* 옵션 */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="isPinned"
              checked={isPinned}
              onCheckedChange={setIsPinned}
            />
            <Label htmlFor="isPinned">상단 고정</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="isNotice"
              checked={isNotice}
              onCheckedChange={setIsNotice}
            />
            <Label htmlFor="isNotice">공지사항</Label>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => handleSubmit("draft")}
          disabled={createPost.isPending || updatePost.isPending}
        >
          <Save className="mr-2 size-4" />
          임시 저장
        </Button>
        <Button
          onClick={() => handleSubmit("published")}
          disabled={createPost.isPending || updatePost.isPending}
        >
          <Send className="mr-2 size-4" />
          {isEditMode ? "수정 완료" : "등록"}
        </Button>
      </CardFooter>
    </Card>
  );
}
