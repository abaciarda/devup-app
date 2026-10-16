import { editionTimeZone } from "../../edition-date";

function localMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: editionTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

export function inPreparationWindow(now: Date): boolean {
  const minutes = localMinutes(now);
  return minutes >= 6 * 60 + 30 && minutes < 11 * 60;
}

export function inPublicationWindow(now: Date): boolean {
  const minutes = localMinutes(now);
  return minutes >= 7 * 60 && minutes < 11 * 60;
}

export function publicationTimeReached(now: Date): boolean {
  return localMinutes(now) >= 7 * 60;
}

export function morningDeliveryOverdue(now: Date): boolean {
  return localMinutes(now) >= 7 * 60 + 15;
}
