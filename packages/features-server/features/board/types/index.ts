import type { Board, BoardPost } from "@superbuilder/drizzle";

export interface CreateBoardInput {
  name: string;
  slug: string;
  type?: "general" | "gallery" | "qna";
  description?: string;
  settings?: Record<string, unknown>;
  isActive?: boolean;
  order?: number;
}

export interface UpdateBoardInput {
  name?: string;
  slug?: string;
  type?: "general" | "gallery" | "qna";
  description?: string;
  settings?: Record<string, unknown>;
  isActive?: boolean;
  order?: number;
}

export interface BoardWithStats extends Board {
  postCount?: number;
  latestPostAt?: Date | null;
}

export interface CreatePostInput {
  boardId: string;
  title: string;
  content: string;
  status?: "draft" | "published" | "hidden";
  isPinned?: boolean;
  isNotice?: boolean;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  status?: "draft" | "published" | "hidden";
  isPinned?: boolean;
  isNotice?: boolean;
}

export interface PostWithAuthor extends BoardPost {
  author?: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
  };
}

export interface PostDetail extends PostWithAuthor {
  board?: Board;
  attachments?: Array<{
    id: string;
    postId: string;
    fileId: string;
    order: number;
  }>;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedPosts {
  items: PostWithAuthor[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
  hasMore?: boolean;
}
