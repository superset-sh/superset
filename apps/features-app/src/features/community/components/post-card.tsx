import type { CommunityPost } from "@superbuilder/drizzle";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Bookmark, ExternalLink, Lock, MessageSquare, Pin, Share2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { ReactionSection } from "@superbuilder/widgets/reaction";
import { extractPlainText } from "../utils/content-helpers";
import type { KarmaSummary } from "../hooks/use-karma";
import { KarmaBadge } from "./karma-badge";
import { UserHoverCard } from "./user-hover-card";
import { VoteButtons } from "./vote-buttons";

interface PostCardProps {
  post: CommunityPost;
  communitySlug: string;
  showCommunity?: boolean;
  karma?: KarmaSummary;
}

export function PostCard({ post, communitySlug, showCommunity = false, karma }: PostCardProps) {
  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko });
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion ? 0 : 0.3;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration }}
      className="group border-border hover:bg-muted/50 border-b p-4 transition-colors"
    >
      <div className="min-w-0 flex-1">
        {/* Meta */}
        <div className="text-muted-foreground mb-1.5 flex flex-wrap items-center gap-1.5 text-sm">
          {showCommunity && (
            <>
              <Link
                to="/c/$slug"
                params={{ slug: communitySlug }}
                className="text-foreground hover:text-primary font-semibold transition-colors"
              >
                c/{communitySlug}
              </Link>
              <span className="text-muted-foreground/40">·</span>
            </>
          )}
          <UserHoverCard userId={post.authorId} username={(post as any).authorName ?? "\uC54C \uC218 \uC5C6\uC74C"} karma={karma}>
            <div className="flex items-center gap-1">
              <Avatar size="sm" className="size-4">
                <AvatarFallback className="text-[8px]">
                  {((post as any).authorName ?? "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="hover:underline">{(post as any).authorName ?? "\uC54C \uC218 \uC5C6\uC74C"}</span>
            </div>
          </UserHoverCard>
          {karma && (
            <>
              <span className="text-muted-foreground/40">\u00B7</span>
              <KarmaBadge karma={karma.totalKarma} />
            </>
          )}
          <span className="text-muted-foreground/40">·</span>
          <span>{timeAgo}</span>
          {post.isPinned && (
            <Badge
              variant="outline"
              className="ml-0.5 gap-0.5 border-green-200 px-1.5 py-0 text-[10px] text-green-600 dark:border-green-800"
            >
              <Pin className="size-2.5" />
              고정
            </Badge>
          )}
          {post.isLocked && (
            <Badge
              variant="outline"
              className="gap-0.5 border-yellow-200 px-1.5 py-0 text-[10px] text-yellow-600 dark:border-yellow-800"
            >
              <Lock className="size-2.5" />
              잠김
            </Badge>
          )}
        </div>

        {/* Title */}
        <Link to="/c/$slug/post/$postId" params={{ slug: communitySlug, postId: post.id }}>
          <h3 className="group-hover:text-primary mb-1 line-clamp-2 cursor-pointer text-lg font-semibold transition-colors">
            {post.title}
          </h3>
        </Link>

        {/* Content Preview */}
        {post.type === "text" && post.content && (
          <p className="text-muted-foreground mb-2 line-clamp-3 text-sm">
            {extractPlainText(post.content, 200)}
          </p>
        )}

        {post.type === "link" && post.linkUrl && (
          <a
            href={post.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary mb-2 inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="max-w-xs truncate">
              {(() => {
                try {
                  return new URL(post.linkUrl).hostname;
                } catch {
                  return post.linkUrl;
                }
              })()}
            </span>
          </a>
        )}

        {post.type === "image" && post.mediaUrls && post.mediaUrls.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-md border">
            <img
              src={post.mediaUrls[0]}
              alt={post.title}
              className="aspect-video w-full rounded-md object-cover"
            />
          </div>
        )}

        {post.type === "video" && (
          <div className="bg-muted mb-2 flex items-center justify-center rounded-md border p-6">
            <span className="text-muted-foreground text-sm">🎬 동영상 게시물</span>
          </div>
        )}

        {post.type === "poll" && (
          <div className="bg-muted mb-2 flex items-center justify-center rounded-md border p-6">
            <span className="text-muted-foreground text-sm">📊 투표 게시물</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1">
          <VoteButtons
            targetType="post"
            targetId={post.id}
            voteScore={post.voteScore}
            upvoteCount={post.upvoteCount}
            downvoteCount={post.downvoteCount}
            size="sm"
          />
          <Link to="/c/$slug/post/$postId" params={{ slug: communitySlug, postId: post.id }}>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground h-8 gap-1.5"
            >
              <MessageSquare className="size-3.5" />
              <span className="text-xs">댓글 {post.commentCount}</span>
            </Button>
          </Link>
          <ReactionSection targetType="community_post" targetId={post.id} />
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground h-8 gap-1.5"
          >
            <Share2 className="size-3.5" />
            <span className="text-xs">공유</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground h-8 gap-1.5"
          >
            <Bookmark className="size-3.5" />
            <span className="text-xs">저장</span>
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
