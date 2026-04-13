export const SOUNDIOX_PRICING = {
  premium: 4.99,
  artist: 8.99,
} as const;

export function formatEuroPrice(value: number) {
  return `EUR ${value.toFixed(2)}`;
}
