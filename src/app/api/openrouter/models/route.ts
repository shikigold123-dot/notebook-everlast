import { NextResponse } from "next/server";
import { CURATED_CHAT_MODELS } from "@/lib/openrouter/chat-models";

export async function GET() {
  return NextResponse.json({ models: CURATED_CHAT_MODELS });
}
