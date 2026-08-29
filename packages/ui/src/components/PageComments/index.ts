export {
	CommentModeButton,
	CommentModeToggle,
} from "./components/CommentModeToggle";
export { CommentsSidebar } from "./components/CommentsSidebar";
export { PageCommentsView } from "./components/PageCommentsView";
export {
	DeletePageDialog,
	PageHeader,
	type PageHeaderActions,
	type PageHeaderOwner,
	type PageHeaderPage,
	type PageHeaderVersion,
	PageSharePopover,
	PageTitleMenu,
	type PageVisibility,
} from "./components/PageHeader";
export { useFramePointerDown } from "./hooks/useFramePointerDown";
export {
	type CommentDraft,
	CommentProvider,
	type CommentStore,
	type CommentThread,
	type PageComment,
	type PageCommentUser,
	useComments,
} from "./providers/CommentProvider";
export {
	AGENT_DISPLAY_NAME,
	type CommentAuthor,
	commentAuthor,
} from "./utils/commentAuthor";
export type {
	CommentAnchor,
	FrameRect,
} from "./utils/commentRuntime";
