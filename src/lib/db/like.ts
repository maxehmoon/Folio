export function likeContainsPattern(value: string): string {
  const escaped = value
    .replaceAll("!", "!!")
    .replaceAll("%", "!%")
    .replaceAll("_", "!_");

  return `%${escaped}%`;
}
