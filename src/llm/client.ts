import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../env.ts";

export const MODEL = "claude-sonnet-4-6";

export function createAnthropic(env: Env): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}
