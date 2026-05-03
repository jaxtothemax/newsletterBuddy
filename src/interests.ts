import type { Env } from "./env.ts";
import { clearInterestsOverride, getInterestsOverride, setInterestsOverride } from "./db.ts";
// Bundled at build time via the [[rules]] type="Text" entry in wrangler.toml.
import interestsDefault from "../interests.md";

export async function getEffectiveInterests(env: Env): Promise<string> {
  const override = await getInterestsOverride(env);
  return override ?? interestsDefault;
}

export async function setInterests(env: Env, text: string): Promise<void> {
  await setInterestsOverride(env, text.trim());
}

export async function resetInterests(env: Env): Promise<void> {
  await clearInterestsOverride(env);
}
