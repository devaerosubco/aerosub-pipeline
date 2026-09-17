import { describe, it, expect } from 'vitest';
import { parseCsv, csvToObjects } from './csv.js';

describe('parseCsv', () => {
  it('splits a simple comma-separated grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,note\n"Acme, Inc.",fine')).toEqual([
      ['name', 'note'], ['Acme, Inc.', 'fine'],
    ]);
  });

  it('handles escaped double quotes inside a quoted field', () => {
    expect(parseCsv('a\n"She said ""hi"""')).toEqual([['a'], ['She said "hi"']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('ignores a trailing blank line', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('csvToObjects', () => {
  it('lower-cases headers and maps each row', () => {
    const rows = csvToObjects('Name,Category,Price\nDrone,Aerial,1000');
    expect(rows).toEqual([{ name: 'Drone', category: 'Aerial', price: '1000' }]);
  });

  it('returns [] for an empty file', () => {
    expect(csvToObjects('')).toEqual([]);
  });

  it('fills a missing trailing cell with an empty string', () => {
    const rows = csvToObjects('name,category\nDrone');
    expect(rows).toEqual([{ name: 'Drone', category: '' }]);
  });
});
