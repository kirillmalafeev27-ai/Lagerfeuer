// Контроллер раунда: держит GameState, прогоняет действия через редуктор и раздаёт события
// виду, звуку и интерфейсу. Сам состояние не меняет — только через reduce().

import { balance } from '../config/balance.ts';
import type { LevelId } from '../config/levels.ts';
import type { Cell, Side } from '../core/clearing.ts';
import type { GameEvent } from '../core/events.ts';
import { type Action, reduce } from '../core/rules.ts';
import type { GameState } from '../core/state.ts';
import type { WoodKind } from '../core/wood.ts';

export type Listener = (events: GameEvent[], state: GameState, prev: GameState) => void;

export class GameController {
  state: GameState;
  /** Реальные миллисекунды раунда без пауз (для итогов). */
  playMs = 0;
  private listeners = new Set<Listener>();

  constructor(state: GameState) {
    this.state = state;
  }

  get levelId(): LevelId {
    return this.state.levelId;
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  dispatch(action: Action): GameEvent[] {
    const prev = this.state;
    const r = reduce(prev, action);
    this.state = r.state;
    for (const l of this.listeners) l(r.events, this.state, prev);
    return r.events;
  }

  /** Шаг кадра: время ограничено 100 мс, чтобы подвисания не съедали секунды (2.7.3). */
  tick(dtMs: number): void {
    if (this.state.paused || this.state.status !== 'playing') return;
    const dt = Math.min(Math.max(0, dtMs), balance.frameMaxMs);
    this.playMs += dt;
    this.dispatch({ type: 'TICK', dt: dt / 1000 });
  }

  answer(correct: boolean, timeMs: number): GameEvent[] {
    return this.dispatch({ type: 'ANSWER', correct, timeMs });
  }

  feed(fire: Side): GameEvent[] {
    return this.dispatch({ type: 'SET_INTENT', kind: 'feed', fire });
  }

  move(cell: Cell): GameEvent[] {
    return this.dispatch({ type: 'SET_INTENT', kind: 'move', cell });
  }

  pile(wood?: WoodKind): GameEvent[] {
    return this.dispatch({ type: 'SET_INTENT', kind: 'pile', wood });
  }

  stay(): GameEvent[] {
    return this.dispatch({ type: 'SET_INTENT', kind: 'stay' });
  }

  selectWood(kind: WoodKind): GameEvent[] {
    return this.dispatch({ type: 'SELECT_WOOD', kind });
  }

  pause(): void {
    if (!this.state.paused) this.dispatch({ type: 'PAUSE' });
  }

  resume(): void {
    if (this.state.paused) this.dispatch({ type: 'RESUME' });
  }
}
