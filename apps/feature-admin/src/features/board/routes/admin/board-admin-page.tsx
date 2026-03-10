/**
 * Board Admin Page - 게시판 관리 페이지
 */
import { BoardManager } from "../../pages";

export function BoardAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">게시판 관리</h1>
        <p className="text-muted-foreground">
          게시판을 생성, 수정, 삭제할 수 있습니다.
        </p>
      </div>
      <BoardManager />
    </div>
  );
}
