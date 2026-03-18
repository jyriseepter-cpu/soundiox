export type ArtistIdentityProfile = {
  id: string;
  display_name: string | null;
  slug?: string | null;
  avatar_url: string | null;
  bio?: string | null;
  country?: string | null;
  role?: string | null;
  is_founding: boolean | null;
  like_count_month?: number | null;
};

export type NormalizedArtistIdentity = {
  id: string;
  displayName: string;
  slug: string | null;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  role: string | null;
  isFounding: boolean;
  likeCountMonth: number | null;
};

type TrackWithArtistFields = {
  artist?: string | null;
  user_id?: string | null;
};

export type TrackWithResolvedArtist<T extends TrackWithArtistFields> = T & {
  artistDisplayName: string;
  artistAvatarUrl: string | null;
  artistSlug: string | null;
  artistIsFounding: boolean;
};

function cleanText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export function normalizeArtistIdentity(
  profile: ArtistIdentityProfile
): NormalizedArtistIdentity {
  return {
    id: profile.id,
    displayName: cleanText(profile.display_name) || "AI Artist",
    slug: cleanText(profile.slug),
    avatarUrl: cleanText(profile.avatar_url),
    bio: cleanText(profile.bio),
    country: cleanText(profile.country),
    role: cleanText(profile.role),
    isFounding: Boolean(profile.is_founding),
    likeCountMonth:
      typeof profile.like_count_month === "number"
        ? profile.like_count_month
        : null,
  };
}

export function createArtistIdentityMap(
  profiles: ArtistIdentityProfile[]
): Map<string, NormalizedArtistIdentity> {
  return new Map(
    profiles
      .filter((profile) => typeof profile?.id === "string" && profile.id.length > 0)
      .map((profile) => [profile.id, normalizeArtistIdentity(profile)])
  );
}

export function resolveArtistDisplayName(
  snapshotArtistName: string | null | undefined,
  identity?: NormalizedArtistIdentity | null
) {
  return identity?.displayName || cleanText(snapshotArtistName) || "AI Artist";
}

export function enrichTracksWithArtistIdentity<T extends TrackWithArtistFields>(
  tracks: T[],
  profileMap: Map<string, NormalizedArtistIdentity>
): Array<TrackWithResolvedArtist<T>> {
  return tracks.map((track) => {
    const identity =
      track.user_id && profileMap.has(track.user_id)
        ? profileMap.get(track.user_id) || null
        : null;

    return {
      ...track,
      artistDisplayName: resolveArtistDisplayName(track.artist, identity),
      artistAvatarUrl: identity?.avatarUrl ?? null,
      artistSlug: identity?.slug ?? null,
      artistIsFounding: identity?.isFounding ?? false,
    };
  });
}