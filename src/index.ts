import { chromium } from "playwright";
import { config } from "./config.js";
import { log, sendDiscordNotification, pingUser } from "./notifier.js";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let lastAppointmentText: string | null = null;

async function checkForAppointment(): Promise<void> {
  const start = Date.now();
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  let screenshotPath: string | undefined;

  try {
    log("Seite laden...");
    await page.goto(config.siteUrl, { waitUntil: "domcontentloaded" });

    // 0. Cookie-Banner akzeptieren
    log("Akzeptiere Cookies...");
    await page.click("#cookie_msg_btn_yes");
    await page.waitForTimeout(1000);

    // 1. Button "buttonfunktionseinheit-2" klicken
    log("Klicke buttonfunktionseinheit-2...");
    await page.click("#buttonfunktionseinheit-2");
    await page.waitForTimeout(1000);

    // 2. Accordion header klicken
    log("Klicke Akkordeon-Header...");
    await page.click("#header_concerns_accordion-1022");
    await page.waitForTimeout(1000);

    // 3. Button "button-plus-1616" klicken
    log("Klicke button-plus-1616...");
    await page.click("#button-plus-1616");
    await page.waitForTimeout(1000);

    // 4. WeiterButton klicken
    log("Klicke WeiterButton...");
    await page.click("#WeiterButton");
    await page.waitForTimeout(2000);

    // 5. Alle Checkboxes im .doclist-Element anhaken
    log("Setze Haken...");
    await page.evaluate(() => {
      const doclist = document.querySelector(".doclist");
      if (!doclist) return;
      const checkboxes = doclist.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      for (const cb of checkboxes) {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
          cb.dispatchEvent(new Event("click", { bubbles: true }));
        }
      }
    });
    await page.waitForTimeout(1000);

    // 6. OKButton klicken
    log("Klicke OKButton...");
    await page.click("#OKButton");
    await page.waitForTimeout(1000);

    // 7. Termin-Datum auslesen
    log("Lese Termin-Datum...");
    const nextDateEl = page.locator("dl.grid:nth-child(4) > dd:nth-child(8)");
    const appointmentText = (await nextDateEl.textContent())?.trim() ?? "";

    if (!appointmentText) {
      screenshotPath = await saveScreenshot(page, "no-date");
      log("Kein Termin-Text gefunden – speichere Screenshot");

      const duration = ((Date.now() - start) / 1000).toFixed(1);
      await sendDiscordNotification(
        `${pingUser()} ⚠️ Kein Termin-Text gefunden (Screenshot im Anhang)\nDauer: ${duration}s`,
        screenshotPath
      );
      return;
    }

    log(`Gefundener Termin: ${appointmentText}`);

    if (appointmentText !== lastAppointmentText) {
      const previous = lastAppointmentText ?? "(kein vorheriger Wert)";
      lastAppointmentText = appointmentText;

      log(`Termin hat sich geändert! Vorher: ${previous} → Jetzt: ${appointmentText}`);
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      await sendDiscordNotification(
        `${pingUser()} 🔔 **Neuer Termin verfügbar!**\nVorher: ${previous}\nJetzt: ${appointmentText}\n${config.siteUrl}\nDauer: ${duration}s`
      );
    } else {
      log("Termin unverändert – kein Alarm.");
    }

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    await sendDiscordNotification(
      `✅ Check abgeschlossen – Termin: ${appointmentText} | Dauer: ${duration}s`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Fehler: ${msg}`);
    screenshotPath = await saveScreenshot(page, "error");

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    await sendDiscordNotification(
      `${pingUser()} ❌ **Fehler beim Check:** ${msg}\nDauer: ${duration}s`,
      screenshotPath
    );
  } finally {
    await browser.close();
  }
}

async function saveScreenshot(page: import("playwright").Page, prefix: string): Promise<string | undefined> {
  const dir = "screenshots";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${prefix}-${Date.now()}.png`);
  try {
    await page.screenshot({ path, fullPage: true });
    log(`Screenshot: ${path}`);
    return path;
  } catch {
    return undefined;
  }
}

// --- Polling-Loop ---

async function main(): Promise<void> {
  log("Termin-Notifier gestartet");
  log(`Intervall: ${config.pollIntervalMs / 1000}s | Headless: ${config.headless}`);
  log(`Discord Webhook: ${config.discordWebhookUrl ? "konfiguriert" : "NICHT gesetzt"}`);

  // Erster Check sofort
  await checkForAppointment();

  // Danach im Intervall
  setInterval(() => {
    checkForAppointment().catch((err) => {
      log(`Unerwarteter Fehler: ${err instanceof Error ? err.message : err}`);
    });
  }, config.pollIntervalMs);
}

process.on("SIGINT", () => {
  log("Beende...");
  process.exit(0);
});

main().catch((err) => {
  log(`Start fehlgeschlagen: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});