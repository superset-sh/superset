/**
 * Hello World Feature - Controller
 */

import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from "@nestjs/swagger";
import { HelloWorldService } from "../service/hello-world.service";

@ApiTags("Hello World")
@Controller("hello-world")
export class HelloWorldController {
  constructor(private readonly helloWorldService: HelloWorldService) {}

  @Get()
  @ApiOperation({ summary: "Hello 메시지 조회" })
  @ApiResponse({ status: 200, description: "Hello 메시지 반환" })
  sayHello() {
    return this.helloWorldService.sayHello();
  }

  @Get("greet")
  @ApiOperation({ summary: "이름으로 인사" })
  @ApiQuery({ name: "name", required: false, description: "인사할 이름", example: "World" })
  @ApiResponse({ status: 200, description: "인사 메시지 반환" })
  greet(@Query("name") name: string = "World") {
    return this.helloWorldService.getGreeting(name);
  }
}
