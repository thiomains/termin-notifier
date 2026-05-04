import { chromium } from "playwright";
import { config } from "./config.js";
import { log, sendDiscordNotification } from "./notifier.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let lastAppointmentText: string | null = null;

const CHECKBOX_IDS = [
  "doclist_item_1616_755766",
  "doclist_item_1616_755767",
  "doclist_item_1616_755768",
  "doclist_item_1616_755770",
  "doclist_item_1616_755776",
  "doclist_item_1616_755771",
  "doclist_item_1616_755775",
  "doclist_item_1616_755769",
  "doclist_item_1616_755774",
] as const;

async function checkForAppointment(): Promise<void> {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();

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
    await page.waitForTimeout(1000);

    // 5. Checkboxes per JS anhaken (ohne Klick, um Viewport-Probleme zu umgehen)
    log("Setze Haken...");
    await page.evaluate((ids) => {
      for (const id of ids) {
        const cb = document.getElementById(id) as HTMLInputElement | null;
        if (cb && !cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
          cb.dispatchEvent(new Event("click", { bubbles: true }));
        }
      }
    }, [...CHECKBOX_IDS]);
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
      log("Kein Termin-Text gefunden – speichere Screenshot");
      await saveScreenshot(page, "no-date");
      return;
    }

    log(`Gefundener Termin: ${appointmentText}`);

    if (appointmentText !== lastAppointmentText) {
      const previous = lastAppointmentText ?? "(kein vorheriger Wert)";
      lastAppointmentText = appointmentText;

      log(`Termin hat sich geändert! Vorher: ${previous} → Jetzt: ${appointmentText}`);
      await sendDiscordNotification(
        `🔔 **Neuer Termin verfügbar!**\nVorher: ${previous}\nJetzt: ${appointmentText}\n${config.siteUrl}`
      );
    } else {
      log("Termin unverändert – kein Alarm.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Fehler: ${msg}`);
    await saveScreenshot(page, "error");
  } finally {
    await browser.close();
  }
}

async function saveScreenshot(page: import("playwright").Page, prefix: string): Promise<void> {
  const dir = "screenshots";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${prefix}-${Date.now()}.png`);
  try {
    await page.screenshot({ path, fullPage: true });
    log(`Screenshot: ${path}`);
  } catch {
    // Screenshot selbst fehlgeschlagen
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