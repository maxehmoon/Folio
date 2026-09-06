import type { RecurrenceFrequency } from "@/lib/db/types";

export interface RecurrenceSchedule {
  startsOn: string;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  endsOn?: string | null;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string): DateParts {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) throw new TypeError(`Invalid ISO date "${value}".`);

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    throw new TypeError(`Invalid ISO date "${value}".`);
  }
  return parts;
}

function formatDate(parts: DateParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validateSchedule(schedule: RecurrenceSchedule): void {
  parseIsoDate(schedule.startsOn);
  if (!Number.isSafeInteger(schedule.intervalCount) || schedule.intervalCount <= 0) {
    throw new RangeError("intervalCount must be a positive integer.");
  }
  if (schedule.endsOn) {
    parseIsoDate(schedule.endsOn);
    if (schedule.endsOn < schedule.startsOn) {
      throw new RangeError("endsOn cannot be before startsOn.");
    }
  }
}

export function occurrenceAt(
  schedule: RecurrenceSchedule,
  occurrenceIndex: number,
): string {
  validateSchedule(schedule);
  if (!Number.isSafeInteger(occurrenceIndex) || occurrenceIndex < 0) {
    throw new RangeError("occurrenceIndex must be a non-negative integer.");
  }

  const start = parseIsoDate(schedule.startsOn);
  const intervals = schedule.intervalCount * occurrenceIndex;
  if (!Number.isSafeInteger(intervals)) {
    throw new RangeError("The recurrence interval is too large.");
  }

  if (schedule.frequency === "day" || schedule.frequency === "week") {
    const days = intervals * (schedule.frequency === "week" ? 7 : 1);
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + days));
    return formatDate({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }

  if (schedule.frequency === "month") {
    const absoluteMonth = start.year * 12 + start.month - 1 + intervals;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    return formatDate({
      year,
      month,
      day: Math.min(start.day, daysInMonth(year, month)),
    });
  }

  const year = start.year + intervals;
  return formatDate({
    year,
    month: start.month,
    day: Math.min(start.day, daysInMonth(year, start.month)),
  });
}

export function isOccurrenceWithinSchedule(
  schedule: RecurrenceSchedule,
  occurrenceDate: string,
): boolean {
  parseIsoDate(occurrenceDate);
  return !schedule.endsOn || occurrenceDate <= schedule.endsOn;
}

export function advanceSchedule(
  schedule: RecurrenceSchedule,
  occurrenceIndex: number,
): {
  occurrenceIndex: number;
  issueDate: string;
  nextOccurrenceIndex: number;
  nextIssueDate: string | null;
} {
  const issueDate = occurrenceAt(schedule, occurrenceIndex);
  if (!isOccurrenceWithinSchedule(schedule, issueDate)) {
    throw new RangeError("The occurrence is after the schedule end date.");
  }
  const nextOccurrenceIndex = occurrenceIndex + 1;
  const candidate = occurrenceAt(schedule, nextOccurrenceIndex);
  return {
    occurrenceIndex,
    issueDate,
    nextOccurrenceIndex,
    nextIssueDate: isOccurrenceWithinSchedule(schedule, candidate) ? candidate : null,
  };
}

export function addPaymentTerms(issueDate: string, days: number): string {
  const issue = parseIsoDate(issueDate);
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new RangeError("Payment terms must be a non-negative integer.");
  }
  const date = new Date(Date.UTC(issue.year, issue.month - 1, issue.day + days));
  return formatDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}
