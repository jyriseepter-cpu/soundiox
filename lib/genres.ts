export const SOUNDIOX_GENRES = [
  "Pop",
  "Rock",
  "Electronic",
  "Hip-Hop / Rap",
  "R&B / Soul",
  "Classical / Cine",
  "Country / Folk",
  "Metal",
] as const;

export type SoundioXGenre = (typeof SOUNDIOX_GENRES)[number];

export const SOUNDIOX_GENRE_OPTIONS = [
  { value: "", label: "Select genre" },
  ...SOUNDIOX_GENRES.map((genre) => ({
    value: genre,
    label: genre,
  })),
];

export function isSoundioXGenre(value: string): value is SoundioXGenre {
  return SOUNDIOX_GENRES.includes(value as SoundioXGenre);
}