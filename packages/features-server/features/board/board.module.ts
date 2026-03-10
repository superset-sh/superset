import { Module, OnModuleInit } from "@nestjs/common";
import { BoardService, PostService } from "./service";
import { BoardController } from "./controller";
import { injectBoardServices } from "./trpc";

@Module({
  controllers: [BoardController],
  providers: [BoardService, PostService],
  exports: [BoardService, PostService],
})
export class BoardModule implements OnModuleInit {
  constructor(
    private readonly boardService: BoardService,
    private readonly postService: PostService
  ) {}

  onModuleInit() {
    // tRPC 라우터에 서비스 주입
    injectBoardServices({
      boardService: this.boardService,
      postService: this.postService,
    });
  }
}
