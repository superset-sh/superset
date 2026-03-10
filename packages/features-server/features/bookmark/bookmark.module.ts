/**
 * Bookmark Feature - NestJS Module
 */

import { Module } from "@nestjs/common";
import { BookmarkController } from "./controller/bookmark.controller";
import { BookmarkService } from "./service";

@Module({
  controllers: [BookmarkController],
  providers: [BookmarkService],
  exports: [BookmarkService],
})
export class BookmarkModule {}
