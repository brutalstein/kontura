export type Mail = { to: string; subject: string; text: string };

/** Mails captured when SMTP is not configured (development and tests). Never used in production. */
export const devOutbox: Mail[] = [];

export const mailConfigured = () => Boolean(process.env.SMTP_URL);
/** Production without an SMTP account, as an explicit operator choice (MAIL_OPTIONAL=true): mail is skipped, never faked, and screens say so. */
export const mailDisabled = () => !mailConfigured() && process.env.NODE_ENV === "production" && process.env.MAIL_OPTIONAL === "true";
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Resolves to false when the mail was skipped because this deployment has no SMTP account. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (mailDisabled()) { console.warn(`[mail:skipped] subject=${mail.subject}`); return false; }
    if (process.env.NODE_ENV === "production") throw new Error("SMTP_URL is required in production to send e-mail (or set MAIL_OPTIONAL=true).");
    devOutbox.push(mail);
    if (devOutbox.length > 200) devOutbox.shift();
    if (process.env.NODE_ENV !== "test") console.info(`[mail:dev] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return true;
  }
  const { createTransport } = await import("nodemailer");
  await createTransport(url).sendMail({ from: process.env.MAIL_FROM ?? "Kontura <no-reply@localhost>", ...mail });
  return true;
}
