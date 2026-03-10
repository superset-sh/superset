/**
 * Hello World Feature - Service
 */

import { Injectable } from "@nestjs/common";

@Injectable()
export class HelloWorldService {
  async sayHello(): Promise<string> {
    return "Hello World from Server! 🚀";
  }

  async getGreeting(name: string): Promise<string> {
    return `Hello, ${name}! Welcome to Feature Atlas.`;
  }
}
