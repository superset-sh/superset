import { MessageSquare, Share2, Bookmark, Pin, Lock, ExternalLink } from "lucide-react";
import { Card, CardTitle, CardDescription, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Link } from "@tanstack/react-router";
import { VoteButtons } from "./vote-buttons";
import { ReactionSection } from "@superbuilder/widgets/reaction";
import type { CommunityPost } from "@superbuilder/drizzle";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface PostCardProps {
  post: CommunityPost;
  communitySlug: string;
  showCommunity?: boolean;
}

export function PostCard({ post, communitySlug, showCommunity = false }: PostCardProps) {
  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko });

  return (
    <Card className="group hover:shadow-md transition-all hover:border-primary/20">
      <CardContent className="flex gap-4 p-4">
        {/* Vote */}
        <div className="flex flex-col items-center pt-1">
          <VoteButtons
            targetType="post"
            targetId={post.id}
            voteScore={post.voteScore}
            upvoteCount={post.upvoteCount}
            downvoteCount={post.downvoteCount}
            size="sm"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 flex-wrap">
            {showCommunity && (
              <>
                <Link
                  to="/c/$slug"
                  params={{ slug: communitySlug }}
                  className="font-semibold text-foreground hover:text-primary transition-colors"
                >
                  c/{communitySlug}
                </Link>
                <span className="text-muted-foreground/40">·</span>
              </>
            )}
            <div className="flex items-center gap-1">
              <Avatar size="sm" className="size-4">
                <AvatarFallback className="text-[8px]">U</AvatarFallback>
              </Avatar>
              <span>작성자</span>
            </div>
            <span className="text-muted-foreground/40">·</span>
            <span>{timeAgo}</span>
            {post.isPinned && (
              <Badge variant="outline" className="ml-0.5 gap-0.5 text-green-600 border-green-200 dark:border-green-800 py-0 px-1.5 text-[10px]">
                <Pin className="size-2.5" />
                고정
              </Badge>
            )}
            {post.isLocked && (
              <Badge variant="outline" className="gap-0.5 text-yellow-600 border-yellow-200 dark:border-yellow-800 py-0 px-1.5 text-[10px]">
                <Lock className="size-2.5" />
                잠김
              </Badge>
            )}
          </div>

          {/* Title */}
          <Link to="/c/$slug/post/$postId" params={{ slug: communitySlug, postId: post.id }}>
            <CardTitle className="text-base font-semibold mb-1 group-hover:text-primary transition-colors cursor-pointer line-clamp-2">
              {post.title}
            </CardTitle>
          </Link>

          {/* Content Preview */}
          {post.type === "text" && post.content && (
            <CardDescription className="line-clamp-2 text-sm mb-2">
              {post.content}
            </CardDescription>
          )}

          {post.type === "link" && post.linkUrl && (
            <a
              href={post.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mb-2"
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate max-w-xs">{post.linkUrl}</span>
            </a>
          )}

          {post.type === "image" && post.mediaUrls && post.mediaUrls.length > 0 && (
            <div className="mb-2 overflow-hidden rounded-lg border">
              <img
                src={post.mediaUrls[0]}
                alt={post.title}
                className="max-h-72 w-auto object-cover"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 -ml-2 pt-1">
            <Link to="/c/$slug/post/$postId" params={{ slug: communitySlug, postId: post.id }}>
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground h-8">
                <MessageSquare className="size-3.5" />
                <span className="text-xs">댓글 {post.commentCount}</span>
              </Button>
            </Link>
            <ReactionSection targetType="community_post" targetId={post.id} />
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground h-8">
              <Share2 className="size-3.5" />
              <span className="text-xs">공유</span>
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground h-8">
              <Bookmark className="size-3.5" />
              <span className="text-xs">저장</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
