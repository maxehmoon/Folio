export const SUPPORTED_TIMEZONES = [
  "UTC",
  ...Intl.supportedValuesOf("timeZone"),
] as const;

export const SUPPORTED_TIMEZONE_IDS = new Set<string>(SUPPORTED_TIMEZONES);

export function formatTimezoneLabel(timezone: string): string {
  return timezone.replaceAll("_", " ");
}
