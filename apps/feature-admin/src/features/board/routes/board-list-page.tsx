/**
 * Board List Page - 게시판 목록 페이지
 */
import { BoardList } from "../pages";

export function BoardListPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">게시판</h1>
        <p className="text-muted-foreground mt-2">
          커뮤니티 게시판 목록입니다.
        </p>
      </div>
      <BoardList />
    </div>
  );
}
