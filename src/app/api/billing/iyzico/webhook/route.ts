import { ZodError } from "zod";
import { handleWebhook } from "@/server/billing";
import { AppError } from "@/server/core";
import { getDb } from "@/server/db";

/** iyzico subscription notifications. Only correctly signed events change anything; redeliveries are acknowledged and ignored. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const result = await handleWebhook(await getDb(), req.headers.get("x-iyz-signature-v3"), body);
    return Response.json({ result });
  } catch (e) {
    if (e instanceof AppError && e.code === "forbidden") return Response.json({ error: "unauthorized" }, { status: 401 });
    if (e instanceof ZodError) return Response.json({ error: "bad request" }, { status: 400 });
    console.error("[billing webhook]", e);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
