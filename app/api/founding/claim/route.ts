import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/founding/claim",
    method: "GET",
    message: "Founding claim API is reachable",
  });
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const accessToken = getBearerToken(request.headers.get("authorization"));

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing bearer token" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const inviteToken = String(body?.inviteToken || "").trim();

    if (!inviteToken) {
      return NextResponse.json(
        { error: "Missing invite token" },
        { status: 400 }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: userError?.message || "Invalid user session" },
        { status: 401 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: invite, error: inviteError } = await admin
      .from("founding_invites")
      .select("id, email, token, used, used_by, used_at, status, claimed_by, claimed_at")
      .eq("token", inviteToken)
      .maybeSingle();

    if (inviteError) {
      console.error("Founding invite lookup error:", inviteError);
      return NextResponse.json(
        { error: inviteError.message || "Invite lookup failed" },
        { status: 500 }
      );
    }

    if (!invite) {
      return NextResponse.json(
        { error: "Invite not found" },
        { status: 404 }
      );
    }

    const alreadyUsedBySomeoneElse =
      (invite.used && invite.used_by && invite.used_by !== user.id) ||
      (invite.claimed_by && invite.claimed_by !== user.id) ||
      invite.status === "claimed";

    if (alreadyUsedBySomeoneElse) {
      return NextResponse.json(
        { error: "Invite already used" },
        { status: 409 }
      );
    }

    const inviteEmail = String(invite.email || "").trim().toLowerCase();
    const userEmail = String(user.email || "").trim().toLowerCase();

    if (inviteEmail && userEmail && inviteEmail !== userEmail) {
      return NextResponse.json(
        { error: "Invite email does not match logged in user" },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: user.id,
        email: user.email || null,
        role: "artist",
        plan: "artist",
        is_founding: true,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("Founding profile update error:", profileError);
      return NextResponse.json(
        { error: profileError.message || "Profile update failed" },
        { status: 500 }
      );
    }

    const { error: markInviteError } = await admin
      .from("founding_invites")
      .update({
        used: true,
        used_by: user.id,
        used_at: nowIso,
        status: "used",
        claimed_by: user.id,
        claimed_at: nowIso,
      })
      .eq("id", invite.id);

    if (markInviteError) {
      console.error("Founding invite mark used error:", markInviteError);
      return NextResponse.json(
        { error: markInviteError.message || "Invite update failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      role: "artist",
      plan: "artist",
      is_founding: true,
    });
  } catch (error: any) {
    console.error("Founding claim unexpected error:", error);

    return NextResponse.json(
      { error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
