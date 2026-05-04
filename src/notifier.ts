import { config } from "./config.js";

export function log(msg: string): void {
  const ts = new Date().toLocaleString("de-DE");
  console.log(`[${ts}] ${msg}`);
}

export async function sendDiscordNotification(message: string): Promise<void> {
  if (!config.discordWebhookUrl) {
    log("DISCORD_WEBHOOK_URL nicht gesetzt – Benachrichtigung übersprungen");
    return;
  }

  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });

    if (!res.ok) {
      log(`Discord-Fehler: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    log(`Discord-Fehler: ${err instanceof Error ? err.message : err}`);
  }
}