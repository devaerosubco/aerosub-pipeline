import { describe, it, expect } from 'vitest';
import { eventsInWindow, buildNotificationRows, groupByUser } from './build.js';

describe('eventsInWindow', () => {
  const today = '2026-09-25';
  it('includes an event exactly on the boundary (windowDays away)', () => {
    const events = [{ id: 'e1', name: 'Boundary', start_date: '2026-10-25' }]; // +30
    expect(eventsInWindow(events, 30, today)).toHaveLength(1);
  });
  it('excludes an event one day past the window', () => {
    const events = [{ id: 'e1', name: 'Too far', start_date: '2026-10-26' }]; // +31
    expect(eventsInWindow(events, 30, today)).toHaveLength(0);
  });
  it('includes an event starting today (0 days out)', () => {
    const events = [{ id: 'e1', name: 'Today', start_date: today }];
    expect(eventsInWindow(events, 30, today)).toHaveLength(1);
  });
  it('excludes a past event', () => {
    const events = [{ id: 'e1', name: 'Past', start_date: '2026-09-01' }];
    expect(eventsInWindow(events, 30, today)).toHaveLength(0);
  });
  it('excludes events with no start_date', () => {
    const events = [{ id: 'e1', name: 'No date', start_date: null }];
    expect(eventsInWindow(events, 30, today)).toHaveLength(0);
  });
  it('handles an empty/undefined events list', () => {
    expect(eventsInWindow([], 30, today)).toEqual([]);
    expect(eventsInWindow(undefined, 30, today)).toEqual([]);
  });
});

describe('buildNotificationRows', () => {
  it('cross-products every opted-in user with every upcoming event', () => {
    const users = [{ id: 'u1' }, { id: 'u2' }];
    const events = [{ id: 'e1', name: 'ADIPEC', start_date: '2026-11-09' }];
    const rows = buildNotificationRows(users, events);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.user_id).sort()).toEqual(['u1', 'u2']);
    expect(rows[0]).toMatchObject({ kind: 'event_alert', ref_type: 'event', ref_id: 'e1', title: 'Upcoming: ADIPEC', body: 'Starts 2026-11-09' });
  });
  it('gives every row a fresh id (upsert only needs the conflict key to matter, but ids must not collide)', () => {
    const rows = buildNotificationRows([{ id: 'u1' }], [{ id: 'e1', name: 'A', start_date: '2026-11-01' }, { id: 'e2', name: 'B', start_date: '2026-11-02' }]);
    expect(new Set(rows.map(r => r.id)).size).toBe(2);
  });
  it('returns [] for no users or no events', () => {
    expect(buildNotificationRows([], [{ id: 'e1', name: 'A', start_date: '2026-11-01' }])).toEqual([]);
    expect(buildNotificationRows([{ id: 'u1' }], [])).toEqual([]);
  });
});

describe('groupByUser', () => {
  it('groups inserted rows by user_id, preserving order within a group', () => {
    const rows = [
      { user_id: 'u1', title: 'A' }, { user_id: 'u2', title: 'B' }, { user_id: 'u1', title: 'C' },
    ];
    const grouped = groupByUser(rows);
    expect([...grouped.keys()].sort()).toEqual(['u1', 'u2']);
    expect(grouped.get('u1').map(r => r.title)).toEqual(['A', 'C']);
  });
  it('handles an empty/undefined list', () => {
    expect(groupByUser([]).size).toBe(0);
    expect(groupByUser(undefined).size).toBe(0);
  });
});
