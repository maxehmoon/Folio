type FirstRunMessageInput = {
  hasOwner: boolean;
  setupToken: string;
};

export function firstRunSetupMessage({
  hasOwner,
  setupToken,
}: FirstRunMessageInput): string | null {
  if (hasOwner) return null;

  return [
    "",
    "Folio first-run setup",
    `Setup token: ${setupToken}`,
    "Open /setup on this Folio instance.",
    "This token will be logged on every boot until the owner account is created.",
    "",
  ].join("\n");
}
