import { Bridge, db, T } from "@wacman/core";
import { deliver, digestMail } from "./mail.js";

/**
 * Récapitulatif quotidien WiBridge : du lundi au vendredi, à partir de 8 h (heure de Paris), une fois par jour.
 * La ligne (digest, jour) de bridge_jobs garantit un seul envoi, même avec plusieurs instances de l'API.
 */
export function startBridgeScheduler(log: (m: string) => void) {
  const tick = async () => {
    try {
      const now = new Date();
      const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
      const dow = paris.getDay();
      const hour = paris.getHours();
      if (dow === 0 || dow === 6 || hour < 8 || hour >= 12) return;
      const day = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
      const claimed = await db.insert(T.bridgeJobs).values({ name: "digest", day }).onConflictDoNothing().returning();
      if (!claimed.length) return;
      const batches = await Bridge.digestBatches();
      await deliver(batches.map(digestMail), log);
      log(`[wibridge] récapitulatif du ${day} : ${batches.length} e-mail(s)`);
    } catch (e) {
      console.error("[wibridge] récapitulatif non envoyé", e);
    }
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 5 * 60_000).unref();
}
