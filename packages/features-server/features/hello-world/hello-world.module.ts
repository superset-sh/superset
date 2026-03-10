/**
 * Hello World Feature - NestJS Module
 */

import { Module } from "@nestjs/common";
import { HelloWorldController } from "./controller/hello-world.controller";
import { HelloWorldService } from "./service/hello-world.service";

@Module({
  controllers: [HelloWorldController],
  providers: [HelloWorldService],
  exports: [HelloWorldService],
})
export class HelloWorldModule {}
