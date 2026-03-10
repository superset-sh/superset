// Connected Component
export { CommentSection } from "./comment-section";

// Sub-components (for custom layouts)
export { CommentForm, CommentItem, CommentList } from "./components";
export type { CommentFormProps, CommentItemProps } from "./components";

// Hooks
export { useComments, useCommentReplies, useCommentCount } from "./hooks";
export { useCreateComment, useUpdateComment, useDeleteComment } from "./hooks";

// Types
export * from "./types";
