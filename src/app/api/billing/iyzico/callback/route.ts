import { completeCheckout } from "@/server/billing";
import { AppError } from "@/server/core";
import { getDb } from "@/server/db";
import { appUrl } from "@/server/mail";

/**
 * iyzico sends the customer's browser here (form POST with `token`) after the hosted checkout.
 * The token is only a lookup key: plan and organisation come from iyzico's own signed API response.
 */
export async function POST(req: Request) {
  const back = (result: string) => Response.redirect(`${appUrl()}/panel/ayarlar/abonelik?odeme=${result}`, 303);
  try {
    const token = (await req.formData()).get("token");
    if (typeof token !== "string" || !token) return back("hata");
    await completeCheckout(await getDb(), token);
    return back("ok");
  } catch (e) {
    if (!(e instanceof AppError)) console.error("[billing callback]", e);
    return back("hata");
  }
}
