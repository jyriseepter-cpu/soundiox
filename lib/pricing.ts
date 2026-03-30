export const SOUNDIOX_PRICING = {
  premium: 3.99,
  artist: 6.99,
} as const;

export function formatEuroPrice(value: number) {
  return `EUR ${value.toFixed(2)}`;
}
