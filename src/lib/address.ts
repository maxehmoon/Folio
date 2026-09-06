export function joinAddressParts(parts: readonly (string | null | undefined)[]) {
  const lines = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return lines.length > 0 ? lines.join("\n") : null;
}
