import { useState } from "react";
import { sessionAtom } from "@superbuilder/features-client/core/auth";
import { TipTapViewer } from "@superbuilder/feature-ui/editor/tiptap-viewer";
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
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useAtomValue } from "jotai";
import {
  ArrowLeft,
  Bookmark,
  FileText,
  Flag,
  MessageSquare,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { ReactionSection } from "@superbuilder/widgets/reaction";
import { CommentItem, type CommentWithAuthor } from "../components/comment-item";
import { useKarma } from "../hooks/use-karma";
import { VoteButtons } from "../components/vote-buttons";
import { KarmaBadge } from "../components/karma-badge";
import {
  useCommunityPost,
  useCreateComment,
  useDeletePost,
  usePostComments,
  useUpdatePost,
} from "../hooks";
import { isRichContent } from "../utils/content-helpers";

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
  const commentsData: CommentWithAuthor[] = commentsPages?.pages.flatMap((p) => p.items) ?? [];
  const createComment = useCreateComment();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  const allAuthorIds = [
    post?.authorId,
    ...commentsData.map((c) => c.authorId),
  ].filter(Boolean) as string[];
  const { data: karmaMap } = useKarma(allAuthorIds);

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
      },
    );
  };

  if (isLoadingPost) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-9 w-40" />
        <Card className="p-6">
          <div className="flex gap-4">
            <div className="space-y-2">
              <Skeleton className="size-8 rounded" />
              <Skeleton className="mx-auto h-4 w-6" />
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
          <Skeleton className="mb-4 h-5 w-24" />
          <Skeleton className="h-24 w-full rounded-md" />
        </Card>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
          <FileText className="text-muted-foreground size-8" />
        </div>
        <h3 className="mb-1 text-lg font-semibold">게시글을 찾을 수 없습니다</h3>
        <p className="text-muted-foreground mb-6">존재하지 않거나 삭제된 게시글입니다.</p>
        <Link to="/c/$slug" params={{ slug }}>
          <Button variant="outline">커뮤니티로 돌아가기</Button>
        </Link>
      </div>
    );
  }

  const isDeleted = post.status === "deleted" || post.status === "removed";
  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Back */}
      <Link to="/c/$slug" params={{ slug }}>
        <Button variant="ghost" className="-ml-2 gap-2">
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
          <div className="min-w-0 flex-1">
            {/* Meta */}
            <div className="text-muted-foreground mb-3 flex flex-wrap items-center gap-2 text-sm">
              <Link
                to="/c/$slug"
                params={{ slug }}
                className="text-foreground hover:text-primary font-semibold transition-colors"
              >
                c/{slug}
              </Link>
              <span className="text-muted-foreground/40">·</span>
              <div className="flex items-center gap-1.5">
                <Avatar size="sm">
                  <AvatarFallback>{((post as any).authorName ?? "?").charAt(0)}</AvatarFallback>
                </Avatar>
                <span>{(post as any).authorName ?? "알 수 없음"}</span>
              </div>
              {karmaMap?.get(post.authorId) && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <KarmaBadge karma={karmaMap.get(post.authorId)!.totalKarma} />
                </>
              )}
              <span className="text-muted-foreground/40">·</span>
              <span>{timeAgo}</span>
            </div>

            {isEditing ? (
              <div className="mb-4 space-y-3">
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
                <CardTitle className="mb-4 text-2xl">{post.title}</CardTitle>

                {post.type === "text" && post.content && (
                  <div className="prose prose-sm dark:prose-invert mb-4 max-w-none">
                    {isRichContent(post.content) ? (
                      (() => {
                        try {
                          return <TipTapViewer content={JSON.parse(post.content)} />;
                        } catch {
                          return <p className="whitespace-pre-wrap">{post.content}</p>;
                        }
                      })()
                    ) : (
                      <p className="whitespace-pre-wrap">{post.content}</p>
                    )}
                  </div>
                )}

                {post.type === "link" && post.linkUrl && (
                  <a
                    href={post.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary mb-4 block hover:underline"
                  >
                    {post.linkUrl}
                  </a>
                )}

                {post.type === "image" && post.mediaUrls && post.mediaUrls.length > 0 && (
                  <div className="mb-4 overflow-hidden rounded-lg border">
                    <img src={post.mediaUrls[0]} alt={post.title} className="max-w-full" />
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            {!isDeleted && (
              <>
                <Separator className="mb-3" />
                <div className="-ml-2 flex items-center gap-1">
                  {isAuthor && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground gap-1.5"
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
                        <AlertDialogTrigger
                          render={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive gap-1.5"
                              disabled={deletePost.isPending}
                            >
                              <Trash2 className="size-3.5" />
                              <span>{deletePost.isPending ? "삭제 중..." : "삭제"}</span>
                            </Button>
                          }
                        />
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground gap-1.5"
                  >
                    <Share2 className="size-3.5" />
                    <span>공유</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground gap-1.5"
                  >
                    <Bookmark className="size-3.5" />
                    <span>저장</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground gap-1.5"
                  >
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
            <h3 className="mb-3 text-sm font-semibold">댓글 작성</h3>
            <Textarea
              placeholder="의견을 남겨보세요..."
              rows={4}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="mt-3 flex justify-end">
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
          <CardTitle className="flex items-center gap-2 text-base">
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
        <CardContent className="space-y-4 pt-6">
          {isLoadingComments ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-6 shrink-0 rounded-full" />
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
              <div className="bg-muted mb-3 rounded-full p-3">
                <MessageSquare className="text-muted-foreground size-5" />
              </div>
              <p className="text-muted-foreground text-sm">
                아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!
              </p>
            </div>
          ) : (
            <>
              {commentsData
                .filter((c) => !c.parentId)
                .map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    allComments={commentsData}
                    karmaMap={karmaMap}
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
