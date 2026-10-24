// События редуктора (раздел 13.3.3). Вид подписан на них и не меняет состояние сам.

import type { Cell, Side } from './clearing.ts';
import type { WoodKind } from './wood.ts';

export type DenyReason = 'noFit' | 'oakOnEmbers' | 'noWood';

export type GameEvent =
  | { type: 'STEP'; from: Cell; to: Cell }
  | { type: 'PICKUP'; kind: WoodKind; n: number }
  | { type: 'SWAP'; kind: WoodKind }
  | { type: 'FED'; fire: Side; kind: WoodKind; relit: boolean }
  | { type: 'OAK_CAUGHT'; fire: Side; relit: boolean }
  | { type: 'FIRE_LOW'; fire: Side; level: 1 | 2 }
  | { type: 'EMBERS'; fire: Side }
  | { type: 'RELIT'; fire: Side; by: WoodKind }
  | { type: 'EMBER_COUNTDOWN'; fire: Side; n: number }
  | { type: 'WIND_WARN'; side: Side }
  | { type: 'WIND_START'; side: Side }
  | { type: 'WIND_END'; side: Side }
  | { type: 'DAWN_START' }
  | { type: 'WOLF_IN'; fire: Side }
  | { type: 'DAWN'; stars: 0 | 1 | 2 | 3 }
  | { type: 'DENIED'; reason: DenyReason; fire?: Side }
  | { type: 'READY' }
  | { type: 'INTENT'; auto: boolean }
  | { type: 'X2'; on: boolean };

export type GameEventType = GameEvent['type'];
