// API Input types
export type ToggleBookmarkInput = {
  targetType: string;
  targetId: string;
};

export type GetBookmarkInput = {
  targetType: string;
  targetId: string;
};

// API Output types
export type ToggleBookmarkResult = {
  added: boolean;
};

export type BookmarkItem = {
  id: string;
  targetType: string;
  targetId: string;
  createdAt: Date;
};
