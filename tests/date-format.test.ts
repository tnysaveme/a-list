import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOfMonth,
  fullDate,
  mediumDate,
  monthName,
  shortDate,
  shortDateInYear,
  weekdayName,
} from '../lib/date-format';

test('calendar dates and timestamps share one UTC display scale', () => {
  assert.equal(fullDate('2026-11-05'), 'November 5, 2026');
  assert.equal(mediumDate('2026-11-05'), 'Nov 5, 2026');
  assert.equal(shortDate('2026-11-05'), 'Nov 5');
  // Timestamps use their UTC calendar day, matching server-rendered text.
  assert.equal(mediumDate('2026-11-05T23:30:00Z'), 'Nov 5, 2026');
  assert.equal(fullDate('2026-01-01T00:15:00Z'), 'January 1, 2026');
});

test('short dates add the year only outside the reference year', () => {
  assert.equal(shortDateInYear('2026-12-31', '2026-11-24'), 'Dec 31');
  assert.equal(shortDateInYear('2027-01-02', '2026-11-24'), 'Jan 2, 2027');
});

test('date tile parts are unpadded and timezone-independent', () => {
  assert.equal(weekdayName('2026-11-24'), 'Tue');
  assert.equal(dayOfMonth('2026-11-05'), '5');
  assert.equal(monthName('2026-11-05'), 'Nov');
});
