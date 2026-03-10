/**
 * Board Feature - Client Types
 */

// 게시판 타입
export type BoardType = "general" | "gallery" | "qna";

// 게시물 상태
export type PostStatus = "draft" | "published" | "hidden";

// 게시판 설정
export type BoardSettings = {
  allowAnonymous?: boolean;
  allowComments?: boolean;
  allowAttachments?: boolean;
  maxAttachments?: number;
  allowedFileTypes?: string[];
  postsPerPage?: number;
};

// 게시판
export type Board = {
  id: string;
  name: string;
  slug: string;
  type: BoardType;
  description: string | null;
  settings: BoardSettings;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

// 게시판 + 통계
export type BoardWithStats = Board & {
  postCount: number;
};

// 작성자 정보
export type PostAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
};

// 게시물
export type BoardPost = {
  id: string;
  boardId: string;
  authorId: string;
  title: string;
  content: string;
  status: PostStatus;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isPinned: boolean;
  isNotice: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// 게시물 + 작성자
export type PostWithAuthor = BoardPost & {
  author: PostAuthor;
};

// 첨부파일
export type BoardPostAttachment = {
  id: string;
  postId: string;
  fileId: string;
  order: number;
};

// 게시물 상세
export type PostDetail = PostWithAuthor & {
  attachments: BoardPostAttachment[];
  board: Pick<Board, "id" | "name" | "slug" | "type">;
};

// 페이지네이션 결과
export type PaginatedPosts = {
  items: PostWithAuthor[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
