export function normalizeTimestamp(ts: string | number | undefined): number | undefined {
  if (ts === undefined) {
    return undefined;
  }

  if (typeof ts === "number") {
    return Math.floor(ts);
  }

  if (/^\d+$/.test(ts)) {
    return Math.floor(parseInt(ts, 10));
  }

  const parsedUtcTimestamp = parseUtcTimestampWithoutOffset(ts);
  if (parsedUtcTimestamp !== undefined) {
    return parsedUtcTimestamp;
  }

  const parsed = new Date(ts);
  if (isNaN(parsed.getTime())) {
    return undefined;
  }

  return Math.floor(parsed.getTime() / 1000);
}

function parseUtcTimestampWithoutOffset(ts: string): number | undefined {
  const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, fraction = "0"] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  const milliseconds = Number(fraction.padEnd(3, "0"));

  const utcMillis = Date.UTC(
    yearNumber,
    monthNumber - 1,
    dayNumber,
    hourNumber,
    minuteNumber,
    secondNumber,
    milliseconds,
  );

  const parsed = new Date(utcMillis);
  if (
    parsed.getUTCFullYear() !== yearNumber ||
    parsed.getUTCMonth() !== monthNumber - 1 ||
    parsed.getUTCDate() !== dayNumber ||
    parsed.getUTCHours() !== hourNumber ||
    parsed.getUTCMinutes() !== minuteNumber ||
    parsed.getUTCSeconds() !== secondNumber ||
    parsed.getUTCMilliseconds() !== milliseconds
  ) {
    return undefined;
  }

  return Math.floor(utcMillis / 1000);
}
