import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeLiveCandle, oracleCandle, localChartTime } from '../src/services/chartLive.mjs';
import { coinOverview } from '../shared/coinOverview.mjs';

test('live candles update the active bar and preserve every completed bar at rollover', () => {
  let rows = [{ time: 120, open: 10, high: 11, low: 9, close: 10 }];
  rows = mergeLiveCandle(rows, oracleCandle(rows, 12, 170, 60));
  assert.equal(rows.length, 1); assert.equal(rows[0].open, 10); assert.equal(rows[0].high, 12);
  rows = mergeLiveCandle(rows, oracleCandle(rows, 13, 180, 60));
  assert.deepEqual(rows.map(row => row.close), [12, 13]);
  rows = mergeLiveCandle(rows, oracleCandle(rows, 14, 240, 60));
  assert.deepEqual(rows.map(row => row.time), [120, 180, 240]);
  assert.equal(mergeLiveCandle(rows, { time: 1, open: 1, high: 1, low: 1, close: 1 }), rows);
  assert.equal(mergeLiveCandle(rows, { time: 300, open: 1, high: NaN, low: 1, close: 1 }), rows);
});

test('one-second bars retain real event timestamps without filling missing seconds', () => {
  let rows = [];
  for (const time of [1000, 1001, 1007]) rows = mergeLiveCandle(rows, oracleCandle(rows, 10, time, 1));
  assert.deepEqual(rows.map(row => row.time), [1000, 1001, 1007]);
});

test('chart labels follow local timezone including daylight saving without moving candle timestamps', () => {
  const summer = Date.parse('2026-10-18T09:00:00Z') / 1000;
  const winter = Date.parse('2026-12-18T09:00:00Z') / 1000;
  const format = { hour: '2-digit', minute: '2-digit', hour12: false };
  assert.equal(localChartTime(summer, format, 'it-IT', 'Europe/Rome'), '11:00');
  assert.equal(localChartTime(winter, format, 'it-IT', 'Europe/Rome'), '10:00');
  assert.equal(localChartTime(summer, format, 'en-GB', 'America/New_York'), '05:00');
});

test('coin overview removes generated quote snapshots while keeping asset facts', () => {
  assert.equal(coinOverview('Bitcoin (BTC) is a cryptocurrency. Users can mine BTC. Bitcoin has a current supply of 20,000. The last known price is 10.'), 'Bitcoin (BTC) is a cryptocurrency. Users can mine BTC.');
  assert.equal(coinOverview('A smart-contract network. The last known price is 5. It is currently trading on 40 markets.'), 'A smart-contract network.');
});
