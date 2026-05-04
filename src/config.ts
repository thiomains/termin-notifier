import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env") });

export const config = {
  siteUrl: "https://termine-reservieren.de/termine/westerwaldkreis/",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60_000),
  headless: process.env.HEADLESS !== "false",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
} as const;