import { afterEach, describe, expect, it, vi } from "vitest";
import { mailDisabled, sendMail } from "@/server/mail";

afterEach(() => vi.unstubAllEnvs());
const mail = { to: "a@example.com", subject: "s", text: "t" };

describe("mail without an SMTP account", () => {
  it("refuses to drop mail silently in production", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SMTP_URL", ""); vi.stubEnv("MAIL_OPTIONAL", "");
    expect(mailDisabled()).toBe(false);
    await expect(sendMail(mail)).rejects.toThrow("SMTP_URL is required");
  });

  it("skips mail and says so when the operator opted out, and never when SMTP is set", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SMTP_URL", ""); vi.stubEnv("MAIL_OPTIONAL", "true");
    expect(mailDisabled()).toBe(true);
    await expect(sendMail(mail)).resolves.toBe(false);
    vi.stubEnv("SMTP_URL", "smtp://localhost:1");
    expect(mailDisabled()).toBe(false);
  });
});
