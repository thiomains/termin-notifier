import { config } from "./config.js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export function log(msg: string): void {
  const ts = new Date().toLocaleString("de-DE");
  console.log(`[${ts}] ${msg}`);
}

const USER_PING = "<@458315985401937930>";

export async function sendDiscordNotification(
  message: string,
  screenshotPath?: string
): Promise<void> {
  if (!config.discordWebhookUrl) {
    log("DISCORD_WEBHOOK_URL nicht gesetzt – Benachrichtigung übersprungen");
    return;
  }

  try {
    if (screenshotPath) {
      const fileBuffer = readFileSync(screenshotPath);
      const fileName = basename(screenshotPath);
      const formData = new FormData();
      formData.append(
        "payload_json",
        JSON.stringify({ content: message })
      );
      formData.append("file", new Blob([fileBuffer]), fileName);

      const res = await fetch(config.discordWebhookUrl, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) log(`Discord-Fehler: ${res.status} ${res.statusText}`);
    } else {
      const res = await fetch(config.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
      if (!res.ok) log(`Discord-Fehler: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    log(`Discord-Fehler: ${err instanceof Error ? err.message : err}`);
  }
}

export function pingUser(): string {
  return USER_PING;
}