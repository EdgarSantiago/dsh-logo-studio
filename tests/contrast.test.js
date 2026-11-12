import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, readableRgb, splitLightInk } from '../src/contrast.js';

test('white lettering becomes dark on light backgrounds and stays white on dark ones', () => {
  assert.deepEqual(readableRgb([255,255,255], [245,245,247]), [0,0,0]);
  assert.deepEqual(readableRgb([255,255,255], [27,27,31]), [255,255,255]);
  assert.deepEqual(readableRgb([0,0,0], [27,27,31]), [255,255,255]);
  assert.equal(contrastRatio([0,0,0], [255,255,255]), 21);
});
test('custom text colors are retained when their contrast is sufficient', () => {
  assert.deepEqual(readableRgb([0,80,0], [250,250,250]), [0,80,0]);
  for (let grey = 0; grey <= 255; grey++) {
    assert.ok(contrastRatio(readableRgb([245,245,245], [grey,grey,grey]), [grey,grey,grey]) >= 4.5);
  }
});
test('transparent logo lettering gets a mask without changing colored pixels or original bytes', () => {
  const source = new Uint8ClampedArray([0,0,0,0, 255,255,255,255, 240,240,240,100, 20,180,240,255, 250,180,0,255]);
  const original = source.slice(), result = splitLightInk(source);
  assert.ok(result);
  assert.deepEqual(source, original);
  assert.equal(result.colors[7], 0);
  assert.equal(result.mask[7], 255);
  assert.equal(result.mask[11], 100);
  assert.deepEqual(result.colors.slice(12), source.slice(12));
  assert.deepEqual(result.mask.slice(12), new Uint8ClampedArray(8));
});
test('opaque artwork and white letters enclosed by colored artwork stay untouched', () => {
  assert.equal(splitLightInk(new Uint8ClampedArray([255,255,255,255, 20,180,240,255])), undefined);
  const source = new Uint8ClampedArray(5 * 5 * 4);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) source.set([120,60,240,255], (y * 5 + x) * 4);
  source.set([255,255,255,255], (2 * 5 + 2) * 4);
  assert.equal(splitLightInk(source, 5), undefined);
});
