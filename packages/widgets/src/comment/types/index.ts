// Comment target type enum values
export const COMMENT_TARGET_TYPES = ["board_post", "community_post", "blog_post", "page"] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

// Comment status enum values
export const COMMENT_STATUSES = ["visible", "hidden", "deleted"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

// Comment type (aligned with server response — dates as strings, mentions nullable)
export type Comment = {
  id: string;
  content: string;
  authorId: string;
  targetType: CommentTargetType;
  targetId: string;
  parentId: string | null;
  depth: number;
  status: CommentStatus;
  mentions: string[] | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type NewComment = Omit<Comment, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

// Author type (for joined queries)
export type CommentAuthor = {
  id: string;
  name: string;
  avatar: string | null;
};

// API Input types
export type CreateCommentInput = {
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  parentId?: string;
  mentions?: string[];
};

export type UpdateCommentInput = {
  content: string;
  mentions?: string[];
};

export type CommentQueryInput = {
  targetType: CommentTargetType;
  targetId: string;
  page?: number;
  limit?: number;
};

// API Output types
export type CommentWithAuthor = Comment & {
  author: CommentAuthor | null;
};

// Pagination types
export type PaginatedComments = {
  items: CommentWithAuthor[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
