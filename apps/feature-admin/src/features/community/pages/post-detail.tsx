import { useState } from "react";
import { ArrowLeft, Share2, Bookmark, Flag, FileText, Pencil, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { sessionAtom } from "@superbuilder/features-client/core/auth";
import { VoteButtons } from "../components/vote-buttons";
import { ReactionSection } from "@superbuilder/widgets/reaction";
import { CommentItem } from "../components/comment-item";
import { useCommunityPost, usePostComments, useCreateComment, useUpdatePost, useDeletePost } from "../hooks";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface PostDetailProps {
  slug: string;
  postId: string;
}

export function PostDetail({ slug, postId }: PostDetailProps) {
  const [commentSort, setCommentSort] = useState<"old" | "new">("old");
  const [commentText, setCommentText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const navigate = useNavigate();
  const session = useAtomValue(sessionAtom);
  const currentUserId = session?.user?.id;
  const { data: post, isLoading: isLoadingPost } = useCommunityPost(postId);
  const {
    data: commentsPages,
    isLoading: isLoadingComments,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = usePostComments(postId, commentSort);
  const commentsData = commentsPages?.pages.flatMap((p) => p.items) ?? [];
  const createComment = useCreateComment();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  const isAuthor = currentUserId && post?.authorId === currentUserId;

  const handleSubmitComment = () => {
    if (!commentText.trim() || !post) return;

    createComment.mutate(
      {
        postId: post.id,
        content: commentText,
        parentId: undefined,
      },
      {
        onSuccess: () => {
          setCommentText("");
        },
      }
    );
  };

  if (isLoadingPost) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-9 w-40" />
        <Card className="p-6">
          <div className="flex gap-4">
            <div className="space-y-2">
              <Skeleton className="size-8 rounded" />
              <Skeleton className="h-4 w-6 mx-auto" />
              <Skeleton className="size-8 rounded" />
            </div>
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-2 pt-4">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <Skeleton className="h-5 w-24 mb-4" />
          <Skeleton className="h-24 w-full rounded-md" />
        </Card>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FileText className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">게시글을 찾을 수 없습니다</h3>
        <p className="text-muted-foreground mb-6">
          존재하지 않거나 삭제된 게시글입니다.
        </p>
        <Link to="/c/$slug" params={{ slug }}>
          <Button variant="outline">커뮤니티로 돌아가기</Button>
        </Link>
      </div>
    );
  }

  const isDeleted = post.status === "deleted" || post.status === "removed";
  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Back */}
      <Link to="/c/$slug" params={{ slug }}>
        <Button variant="ghost" className="gap-2 -ml-2">
          <ArrowLeft className="size-4" />
          c/{slug}
        </Button>
      </Link>

      {/* Post */}
      <Card>
        <CardContent className="flex gap-4 p-6">
          {/* Vote */}
          <div className="flex flex-col items-center">
            <VoteButtons
              targetType="post"
              targetId={post.id}
              voteScore={post.voteScore}
              upvoteCount={post.upvoteCount}
              downvoteCount={post.downvoteCount}
              size="lg"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Meta */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Link to="/c/$slug" params={{ slug }} className="font-semibold text-foreground hover:text-primary transition-colors">
                c/{slug}
              </Link>
              <span className="text-muted-foreground/40">·</span>
              <div className="flex items-center gap-1.5">
                <Avatar size="sm">
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
                <span>작성자</span>
              </div>
              <span className="text-muted-foreground/40">·</span>
              <span>{timeAgo}</span>
            </div>

            {isEditing ? (
              <div className="space-y-3 mb-4">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-xl font-bold"
                  placeholder="제목"
                />
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  placeholder="내용을 입력하세요..."
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      updatePost.mutate(
                        { id: post.id, data: { title: editTitle, content: editContent } },
                        { onSuccess: () => setIsEditing(false) },
                      );
                    }}
                    disabled={updatePost.isPending}
                  >
                    {updatePost.isPending ? "저장 중..." : "저장"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <CardTitle className="text-2xl mb-4">{post.title}</CardTitle>

                {post.type === "text" && post.content && (
                  <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
                    <p className="whitespace-pre-wrap">{post.content}</p>
                  </div>
                )}

                {post.type === "link" && post.linkUrl && (
                  <a
                    href={post.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline mb-4 block"
                  >
                    {post.linkUrl}
                  </a>
                )}

                {post.type === "image" && post.mediaUrls && post.mediaUrls.length > 0 && (
                  <div className="mb-4 overflow-hidden rounded-lg border">
                    <img
                      src={post.mediaUrls[0]}
                      alt={post.title}
                      className="max-w-full"
                    />
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            {!isDeleted && (
              <>
                <Separator className="mb-3" />
                <div className="flex items-center gap-1 -ml-2">
                  {isAuthor && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditTitle(post.title);
                          setEditContent(post.content ?? "");
                          setIsEditing(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                        <span>수정</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            disabled={deletePost.isPending}
                          >
                            <Trash2 className="size-3.5" />
                            <span>{deletePost.isPending ? "삭제 중..." : "삭제"}</span>
                          </Button>
                        } />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>게시글 삭제</AlertDialogTitle>
                            <AlertDialogDescription>
                              정말로 이 게시글을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => {
                                deletePost.mutate(post.id, {
                                  onSuccess: () => navigate({ to: "/c/$slug", params: { slug } }),
                                });
                              }}
                            >
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                  <ReactionSection targetType="community_post" targetId={post.id} />
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground">
                    <Share2 className="size-3.5" />
                    <span>공유</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground">
                    <Bookmark className="size-3.5" />
                    <span>저장</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground">
                    <Flag className="size-3.5" />
                    <span>신고</span>
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comment Form */}
      {!isDeleted && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-3">댓글 작성</h3>
            <Textarea
              placeholder="의견을 남겨보세요..."
              rows={4}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="flex justify-end mt-3">
              <Button
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || createComment.isPending}
                size="sm"
              >
                {createComment.isPending ? "등록 중..." : "댓글 등록"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="size-4" />
            댓글 {post.commentCount}개
          </CardTitle>
          <Tabs value={commentSort} onValueChange={(v) => setCommentSort(v as typeof commentSort)}>
            <TabsList>
              <TabsTrigger value="old">오래된순</TabsTrigger>
              <TabsTrigger value="new">최신순</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6 space-y-4">
          {isLoadingComments ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </div>
              </div>
            ))
          ) : commentsData.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="rounded-full bg-muted p-3 mb-3">
                <MessageSquare className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!
              </p>
            </div>
          ) : (
            <>
              {commentsData
                .filter((c: any) => !c.parentId)
                .map((comment: any) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment as any}
                    replies={commentsData.filter((c: any) => c.parentId === comment.id) as any}
                  />
                ))}
              {hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "불러오는 중..." : "댓글 더 보기"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
