import { describe, expect, it } from 'vitest';
import { JSONsearch } from '../../../../src/utils/jsonSearch';
describe('JSONsearch', () => {
  it('should find in key and values', () => {
    expect(JSONsearch({ a: 1, b: 'abc', c: 3 }, new RegExp('a'))).toEqual([
      {
        chain: {
          a: 1
        },
        inKey: true,
        key: 'a',
        val: 1
      },
      {
        chain: {
          b: 'abc'
        },
        inKey: false,
        key: 'b',
        val: 'abc'
      }
    ]);
  });
});
