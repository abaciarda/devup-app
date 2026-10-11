export const editionTimeZone = "Europe/Istanbul";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: editionTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function editionDateFromKey(key: string): Date {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(key)) {
    throw new Error("Edition date must use YYYY-MM-DD");
  }

  const date = new Date(`${key}T00:00:00.000Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== key
  ) {
    throw new Error("Edition date must be a real calendar day");
  }

  return date;
}

export function editionDateKey(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("A valid timestamp is required");
  }

  const parts = dateFormatter.formatToParts(now);
  const read = (type: "year" | "month" | "day"): string => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error("Edition date could not be formatted");
    return value;
  };

  const key = `${read("year")}-${read("month")}-${read("day")}`;
  editionDateFromKey(key);
  return key;
}

export function editionDateForNow(now: Date = new Date()): Date {
  return editionDateFromKey(editionDateKey(now));
}
