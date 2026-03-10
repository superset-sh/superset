// Reaction type enum values
export const REACTION_TYPES = ["like", "love", "haha", "wow", "sad", "angry"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

// Reaction type
export type Reaction = {
  id: string;
  targetType: string;
  targetId: string;
  userId: string;
  type: ReactionType;
  createdAt: Date;
  updatedAt: Date;
};

export type NewReaction = {
  targetType: string;
  targetId: string;
  userId: string;
  type?: ReactionType;
};

// API Input types
export type ToggleReactionInput = {
  targetType: string;
  targetId: string;
  type?: ReactionType;
};

export type GetReactionInput = {
  targetType: string;
  targetId: string;
};

// API Output types
export type ReactionCountByType = {
  type: ReactionType;
  count: number;
};

export type ReactionCounts = {
  total: number;
  byType: ReactionCountByType[];
};

export type ToggleReactionResult = {
  added: boolean;
  type: ReactionType;
};

export type UserReactionStatus = {
  hasReacted: boolean;
  types: ReactionType[];
};
