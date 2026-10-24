// Пробы кита для лаборатории (не входит в игру).
import { palette } from '../../config/palette.ts';
import { blob, chalkLine, layer, makePen, pastelFill, pastelStroke, smudge, strip } from '../../shared/pastelKit.ts';
import { stone } from './ground.ts';
import { type RC, type Tex, canvasFor, tex } from './common.ts';

export function drawTest(rc: RC): Tex[] {
  const C = rc.C;
  const [c, x] = canvasFor(C * 6, C * 3);
  x.fillStyle = palette.paper;
  x.fillRect(0, 0, C * 6, C * 3);
  const pen = makePen(5, 0, 0);
  stone(x, pen, C * 0.6, C * 0.6, C * 0.8, C * 0.55);
  stone(x, pen, C * 1.6, C * 0.6, C * 0.4, C * 0.28);
  const b = blob(pen.rng, C * 1.2, C * 1, { cx: C * 3, cy: C * 0.8 });
  layer(x, pen, b, [palette.ground.base, palette.ground.light, palette.ground.dark]);
  const b2 = blob(pen.rng, C * 1.2, C * 1, { cx: C * 4.6, cy: C * 0.8 });
  pastelFill(x, pen, b2, palette.forest.fir, -0.6, 1, { stroke: C * 0.08, under: 0.1 });
  for (let i = 0; i < 6; i++) {
    strip(x, pen, C * 0.3, C * (1.7 + i * 0.2), C * 2.6, C * (1.7 + i * 0.2), [5, 9, 16, 9, 12, 20][i], palette.ground.light, 1);
  }
  pastelStroke(x, pen, [{ x: C * 3, y: C * 1.8 }, { x: C * 4, y: C * 2.2 }, { x: C * 5.5, y: C * 1.9 }], C * 0.12, palette.tent.canvas, 0.95);
  chalkLine(x, pen, [{ x: C * 3, y: C * 2.6 }, { x: C * 4, y: C * 2.8 }, { x: C * 5.5, y: C * 2.5 }], C * 0.04, palette.chalk, false);
  smudge(x, pen, C * 5.4, C * 0.6, C * 0.4, palette.glow, 0.8);
  return [tex('test', c)];
}
