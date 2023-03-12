import { describe, expect, it, jest } from '@jest/globals';
import { ShapiroWilkW, cronbachAlpha } from '../../../../src/utils/stats';

describe('stats utils', () => {
  describe('cronbachAlpha', () => {
    it('produce the right values', () => {
      expect(
        cronbachAlpha([
          [0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1],
          [0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0],
          [1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        ])).toEqual(0.36764705882352927);

        expect(
        cronbachAlpha([
          [0,	1,	1,	0,	1,	0,	1,	0,	0,	1,	1,	0,	1,	1,	1],
          [0,	1,	1,	0,	1,	1,	1,	1,	0,	1,	1,	0,	1,	1,	0],
          [1,	1,	0,	0,	0,	1,	0,	0,	0,	1,	0,	0,	0,	0,	1],
          [0,	1,	1,	1,	1,	1,	1,	1,	1,	1,	1,	0,	1,	1,	1],
          [0,	1,	1,	1,	1,	1,	1,	1,	1,	1,	1,	0,	1,	0,	1],
          [1,	0,	1,	1,	1,	0,	1,	1,	1,	1,	1,	1,	1,	1,	1],
          [0,	0,	0,	1,	0,	0,	1,	0,	0,	1,	1,	1,	1,	0,	0],
          [1,	1,	1,	1,	1,	1,	1,	1,	1,	1,	1,	1,	1,	1,	1],
          [0,	0,	0,	1,	0,	0,	0,	0,	0,	1,	0,	0,	0,	1,	0],
          [0,	1,	0,	0,	0,	1,	0,	1,	0,	0,	0,	1,	1,	1,	1]
        ])).toEqual(0.27562446167097354);
    });
  });

  describe('ShapiroWilkW', () => {
    it('produce the right values', () => {
      expect(ShapiroWilkW([1, 1.3, 0.7, 1.2, 0.9, 1.1])).toEqual(
        0.982586783192874
      );
      expect(
        ShapiroWilkW([
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
        ])
      ).toEqual(0.9620584988168795);
      expect(
        ShapiroWilkW([
          1, 0.9, 1.1, 0.9, 0.95, 1.05, 1.5, 1.4, 1.6, 1.45, 1.55, 1.49, 1.51,
        ])
      ).toEqual(0.838884678462627);
      expect(ShapiroWilkW([22, 26, 27, 31, 33, 35, 37, 43, 44, 45])).toEqual(
        0.9442115069895026
      );
      expect(ShapiroWilkW([21, 25, 27, 29, 32, 36, 38, 41, 46, 45])).toEqual(
        0.9584091320016237
      );
      expect(ShapiroWilkW([25, 24, 28, 30, 33, 35, 37, 40, 43, 45])).toEqual(
        0.9573635762493294
      );
      expect(
        ShapiroWilkW([
          22, 19, 18, 18, 19, 20, 23, 22, 24, 22, 21, 20, 22, 22, 21, 20, 22,
          22, 22, 22,
        ])
      ).toEqual(0.8973933493544848);
      expect(
        ShapiroWilkW([
          20, 19, 19, 21, 19, 20, 23, 21, 21, 21, 21, 20, 20, 20, 20, 22, 20,
          19, 19, 20,
        ])
      ).toEqual(0.8735894248645044);
      expect(
        ShapiroWilkW([
          20, 20, 18, 17, 17, 19, 18, 21, 20, 22, 22, 22, 22, 19, 20, 19, 20,
          20, 20, 21,
        ])
      ).toEqual(0.9180787616725404);
    });
  });
});
