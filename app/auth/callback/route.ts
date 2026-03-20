import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const LIFETIME_DEADLINE_ISO = "2026-03-22T23:59:59Z";

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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const now = new Date();
    const deadline = new Date(LIFETIME_DEADLINE_ISO);
    const grantLifetime = now.getTime() <= deadline.getTime();

    const profilePatch: Record<string, unknown> = {
      id: user.id,
    };

    if (grantLifetime) {
      profilePatch.lifetime_access = true;
      profilePatch.lifetime_granted_at = now.toISOString();
      profilePatch.lifetime_source = "launch_campaign";
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(profilePatch, { onConflict: "id" });

    if (profileError) {
      return NextResponse.redirect(`${origin}/login?error=profile_update_failed`);
    }

    return NextResponse.redirect(`${origin}/discover`);
  } catch {
    const fallbackOrigin =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${fallbackOrigin}/login?error=unexpected_callback_error`);
  }
}