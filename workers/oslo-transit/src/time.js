'use strict';

/** Parse a GTFS HH:MM:SS time, including hours >= 24. */
export function parseGtfsTime(t) {
    if (!t) return 0;
    const parts = String(t).split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
}

/** YYYYMMDD in an IANA timezone. */
export function yyyymmddInZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const pick = (type) => parts.find((p) => p.type === type).value;
    return `${pick('year')}${pick('month')}${pick('day')}`;
}

/** Seconds since local midnight in an IANA timezone. */
export function secSinceMidnightInZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const pick = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
    return pick('hour') * 3600 + pick('minute') * 60 + pick('second');
}

/**
 * UTC offset of `timeZone` at `date`, in seconds (positive east of UTC).
 * Built from local YMD + seconds-since-midnight vs the same instant in UTC.
 */
export function tzOffsetSecAt(date, timeZone) {
    const utc = date.getTime();
    const ymd = yyyymmddInZone(date, timeZone);
    const sec = secSinceMidnightInZone(date, timeZone);
    const y = parseInt(ymd.slice(0, 4), 10);
    const mo = parseInt(ymd.slice(4, 6), 10) - 1;
    const d = parseInt(ymd.slice(6, 8), 10);
    const asUtc = Date.UTC(y, mo, d, 0, 0, 0) + sec * 1000;
    return Math.round((asUtc - utc) / 1000);
}

/**
 * If a trip started after midnight (GTFS hour >= 24) and local clock is
 * still in the early morning, add a day so interpolation stays on the trip.
 */
export function adjustSecForOvernight(secSinceMidnight, tripStartSec) {
    if (tripStartSec > 86400 && secSinceMidnight < 14400) {
        return secSinceMidnight + 86400;
    }
    return secSinceMidnight;
}
