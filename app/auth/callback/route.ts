import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const origin = url.origin;

    if (!code) {
      return NextResponse.redirect(`${origin}/login?error=missing_code`);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        persistSession: false,
      },
    });

    const {
      data: { session },
      error: exchangeError,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !session) {
      return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
    }

    const user = session.user;
    if (!user?.id) {
      return NextResponse.redirect(`${origin}/login?error=user_missing`);
    }

    return NextResponse.redirect(`${origin}/discover`);
  } catch {
    const fallbackOrigin =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${fallbackOrigin}/login?error=unexpected_callback_error`);
  }
}
