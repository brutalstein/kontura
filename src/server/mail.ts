export type Mail = { to: string; subject: string; text: string };

/** Mails captured when SMTP is not configured (development and tests). Never used in production. */
export const devOutbox: Mail[] = [];

export const mailConfigured = () => Boolean(process.env.SMTP_URL);
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function sendMail(mail: Mail): Promise<void> {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP_URL is required in production to send e-mail.");
    devOutbox.push(mail);
    if (devOutbox.length > 200) devOutbox.shift();
    if (process.env.NODE_ENV !== "test") console.info(`[mail:dev] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  const { createTransport } = await import("nodemailer");
  await createTransport(url).sendMail({ from: process.env.MAIL_FROM ?? "Kontura <no-reply@localhost>", ...mail });
}
