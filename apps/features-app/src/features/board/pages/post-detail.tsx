/**
 * PostDetail - 게시물 상세 컴포넌트
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardFooter, CardHeader } from "@superbuilder/feature-ui/shadcn/card";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { ArrowLeft, Eye, Heart, MessageSquare, Edit, Trash2, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { profileAtom } from "@superbuilder/features-client/core/auth";
import { useAtomValue } from "jotai";
import { usePost, useDeletePost } from "../hooks";

interface PostDetailProps {
  postId: string;
  boardSlug: string;
}

export function PostDetail({ postId, boardSlug }: PostDetailProps) {
  const navigate = useNavigate();
  const profile = useAtomValue(profileAtom);
  const { data: post, isLoading, error } = usePost(postId);
  const deletePost = useDeletePost();

  const isAuthor = profile?.id === post?.authorId;

  const handleDelete = async () => {
    try {
      await deletePost.mutateAsync({ id: postId });
      toast.success("게시물이 삭제되었습니다.");
      navigate({ to: `/board/${boardSlug}` as "/" });
    } catch (err) {
      toast.error("삭제에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="text-destructive">게시물을 찾을 수 없습니다.</div>
        <Link to={`/board/${boardSlug}` as "/"}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 size-4" />
            목록으로
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 뒤로가기 */}
      <Link to={`/board/${boardSlug}` as "/"}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 size-4" />
          목록으로
        </Button>
      </Link>

      <Card>
        <CardHeader className="space-y-4">
          {/* 제목 */}
          <div className="flex items-start gap-2">
            {post.isPinned && <Pin className="text-primary mt-1 size-5 shrink-0" />}
            {post.isNotice && <Badge variant="destructive">공지</Badge>}
            <h1 className="text-2xl font-bold">{post.title}</h1>
          </div>

          {/* 작성자 정보 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={post.author?.avatar ?? undefined} />
                <AvatarFallback>
                  {post.author?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{post.author?.name ?? "익명"}</div>
                <div className="text-muted-foreground text-sm">
                  {formatDistanceToNow(new Date(post.createdAt), {
                    addSuffix: true,
                    locale: ko,
                  })}
                </div>
              </div>
            </div>

            {/* 통계 */}
            <div className="text-muted-foreground flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Eye className="size-4" />
                {post.viewCount}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="size-4" />
                {post.likeCount}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="size-4" />
                {post.commentCount}
              </span>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="py-6">
          {/* 본문 */}
          <div className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap">
            {post.content}
          </div>
        </CardContent>

        {isAuthor && (
          <>
            <Separator />
            <CardFooter className="flex justify-end gap-2 py-4">
              <Link to={`/board/${boardSlug}/${postId}/edit` as "/"}>
                <Button variant="outline" size="sm">
                  <Edit className="mr-2 size-4" />
                  수정
                </Button>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                  <Trash2 className="mr-2 size-4" />
                  삭제
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>게시물 삭제</AlertDialogTitle>
                    <AlertDialogDescription>
                      정말 이 게시물을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
