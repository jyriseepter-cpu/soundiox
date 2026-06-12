"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  role: string | null;
  display_name: string | null;
  email?: string | null;
};

type ReviewTrackRow = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  user_id: string | null;
  ready_for_review: boolean | null;
  review_requested_at: string | null;
  created_at: string | null;
  is_published: boolean | null;
  review_status: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

const PENDING_REVIEW_STATUS_FILTER =
  "review_status.is.null,review_status.eq.draft,review_status.eq.ready,review_status.eq.pending_review,review_status.eq.pending";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isAdminishRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "owner";
}

export default function StudioReviewPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tracks, setTracks] = useState<ReviewTrackRow[]>([]);
  const [approvedTracks, setApprovedTracks] = useState<ReviewTrackRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionTrackId, setActionTrackId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReviewQueue() {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!active) return;
          setProfile(null);
          setTracks([]);
          setApprovedTracks([]);
          setError("Log in to access the Studio Review Queue.");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,role,display_name,email")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (profileError) throw profileError;

        if (!active) return;
        setProfile(profileData || null);

        if (!isAdminishRole(profileData?.role)) {
          setTracks([]);
          setApprovedTracks([]);
          setError("Studio Review Queue is restricted to admins.");
          return;
        }

        const { pendingTracks, publishableTracks } = await fetchReviewQueues();

        if (!active) return;
        setTracks(pendingTracks);
        setApprovedTracks(publishableTracks);
      } catch (loadError: any) {
        console.error("Studio review queue load error:", loadError);
        if (!active) return;
        setTracks([]);
        setApprovedTracks([]);
        setError(loadError?.message || "Failed to load Studio Review Queue.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadReviewQueue();

    return () => {
      active = false;
    };
  }, []);

  const canView = isAdminishRole(profile?.role);

  async function fetchReviewQueues() {
    const selectColumns =
      "id,title,artist,genre,audio_url,artwork_url,user_id,ready_for_review,review_requested_at,created_at,is_published,review_status,reviewed_at,review_note";

    const { data: pendingData, error: pendingError } = await supabase
      .from("tracks")
      .select(selectColumns)
      .eq("ready_for_review", true)
      .eq("is_published", false)
      .or(PENDING_REVIEW_STATUS_FILTER)
      .order("review_requested_at", { ascending: false });

    if (pendingError) throw pendingError;

    const { data: approvedData, error: approvedError } = await supabase
      .from("tracks")
      .select(selectColumns)
      .eq("ready_for_review", true)
      .eq("review_status", "approved")
      .eq("is_published", false)
      .order("reviewed_at", { ascending: false });

    if (approvedError) throw approvedError;

    return {
      pendingTracks: Array.isArray(pendingData) ? (pendingData as ReviewTrackRow[]) : [],
      publishableTracks: Array.isArray(approvedData) ? (approvedData as ReviewTrackRow[]) : [],
    };
  }

  async function refreshReviewQueue() {
    const { pendingTracks, publishableTracks } = await fetchReviewQueues();
    setTracks(pendingTracks);
    setApprovedTracks(publishableTracks);
  }

  async function runReviewAction(track: ReviewTrackRow, action: "approve" | "reject" | "publish") {
    setActionTrackId(track.id);
    setStatus(null);
    setActionError(null);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to review Studio tracks.");
      }

      const response = await fetch(`/api/studio-review/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackId: track.id,
          ...(action === "reject" ? { note: "Rejected from Studio Review Queue." } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : `Failed to ${action} review track`
        );
      }

      setStatus(
        action === "approve"
          ? `Approved review for ${track.title || "Untitled track"}.`
          : action === "publish"
            ? `Published ${track.title || "Untitled track"} publicly.`
            : `Rejected review for ${track.title || "Untitled track"}.`
      );
      await refreshReviewQueue();
    } catch (actionError: any) {
      setActionError(actionError?.message || `Failed to ${action} review track.`);
    } finally {
      setActionTrackId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#06111f] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[28px] border border-sky-200/35 bg-sky-400/20 p-5 shadow-[0_30px_100px_rgba(56,189,248,0.18)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.2em] text-sky-100">
                INTERNAL
              </div>
              <h1 className="mt-2 text-2xl font-semibold">Studio Review Queue</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/72">
                Tracks marked ready for review appear here as draft/private items. Approved tracks
                can be published publicly as a separate final admin action.
              </p>
            </div>

            {profile ? (
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/76">
                Role: {profile.role || "none"}
              </div>
            ) : null}
          </div>

          {status ? (
            <div className="mt-4 rounded-2xl border border-sky-100/25 bg-sky-300/10 px-4 py-3 text-sm text-sky-50">
              {status}
            </div>
          ) : null}

          {actionError ? (
            <div className="mt-4 rounded-2xl border border-rose-200/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-50">
              {actionError}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/72">
              Loading review queue...
            </div>
          ) : error ? (
            <div className="mt-5 rounded-2xl border border-rose-200/25 bg-rose-400/10 p-4 text-sm text-rose-50">
              {error}
            </div>
          ) : canView ? (
            <div className="mt-5 space-y-6">
              <section>
                <div className="mb-3 flex flex-col gap-1">
                  <h2 className="text-lg font-semibold text-white">Approved, ready to publish</h2>
                  <p className="text-sm text-white/64">
                    These tracks are approved but still private until an admin publishes them.
                  </p>
                </div>

                {approvedTracks.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/72">
                    No approved tracks are waiting to publish.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {approvedTracks.map((track) => (
                      <article
                        key={track.id}
                        className="rounded-2xl border border-emerald-200/20 bg-emerald-400/10 p-4"
                      >
                        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-lg font-semibold text-white">
                                {track.title || "Untitled track"}
                              </h3>
                              <span className="rounded-full border border-emerald-200/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                                Approved
                              </span>
                            </div>

                            <div className="mt-2 grid gap-2 text-sm text-white/72 sm:grid-cols-2">
                              <div>Artist: {track.artist || "-"}</div>
                              <div>Genre: {track.genre || "-"}</div>
                              <div>User: {track.user_id || "-"}</div>
                              <div>Artwork: {track.artwork_url ? "Ready" : "Missing"}</div>
                              <div>Requested: {formatDate(track.review_requested_at)}</div>
                              <div>Approved: {formatDate(track.reviewed_at)}</div>
                            </div>

                            {track.audio_url ? (
                              <audio className="mt-4 w-full" controls src={track.audio_url}>
                                Your browser does not support audio playback.
                              </audio>
                            ) : (
                              <div className="mt-4 rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-sm text-white/64">
                                Audio preview missing.
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-3">
                            <button
                              type="button"
                              onClick={() => void runReviewAction(track, "publish")}
                              disabled={actionTrackId === track.id}
                              className="inline-flex cursor-pointer items-center justify-center rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 ring-1 ring-emerald-100/60 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionTrackId === track.id ? "Publishing..." : "Publish public"}
                            </button>
                            <div className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-xs text-white/58">
                              Publishing only sets is_published=true. No announcements are sent.
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-3 flex flex-col gap-1">
                  <h2 className="text-lg font-semibold text-white">Pending review</h2>
                  <p className="text-sm text-white/64">
                    Approve or reject tracks that artists marked ready for review.
                  </p>
                </div>

                {tracks.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/72">
                    No tracks are currently ready for review.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tracks.map((track) => (
                  <article
                    key={track.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-semibold text-white">
                            {track.title || "Untitled track"}
                          </h2>
                          <span className="rounded-full border border-amber-200/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                            Review requested
                          </span>
                        </div>

                        <div className="mt-2 grid gap-2 text-sm text-white/72 sm:grid-cols-2">
                          <div>Artist: {track.artist || "-"}</div>
                          <div>Genre: {track.genre || "-"}</div>
                          <div>User: {track.user_id || "-"}</div>
                          <div>Artwork: {track.artwork_url ? "Ready" : "Missing"}</div>
                          <div>Requested: {formatDate(track.review_requested_at)}</div>
                          <div>Created: {formatDate(track.created_at)}</div>
                        </div>

                        {track.audio_url ? (
                          <audio className="mt-4 w-full" controls src={track.audio_url}>
                            Your browser does not support audio playback.
                          </audio>
                        ) : (
                          <div className="mt-4 rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-sm text-white/64">
                            Audio preview missing.
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        <button
                          type="button"
                          onClick={() => void runReviewAction(track, "approve")}
                          disabled={actionTrackId === track.id}
                          className="inline-flex cursor-pointer items-center justify-center rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-sky-200/60 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionTrackId === track.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runReviewAction(track, "reject")}
                          disabled={actionTrackId === track.id}
                          className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/7 px-4 py-2.5 text-sm font-medium text-white/82 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionTrackId === track.id ? "Working..." : "Reject"}
                        </button>
                        <div className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-xs text-white/58">
                          These actions do not set is_published=true.
                        </div>
                      </div>
                    </div>
                  </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
