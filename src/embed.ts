// Встраивание (раздел 13.4): mountBonfires(container, options) → { destroy }.

import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik-scribble/400.css';
import './shared/themes/chalk.css';
import { App, type FinishResult, type MountOptions } from './ui/App.ts';

export type { FinishResult, MountOptions };
export type { Question, QuestionProvider } from './shared/questions/types.ts';
export { LocalBankProvider } from './shared/questions/LocalBankProvider.ts';

export function mountBonfires(container: HTMLElement, options: MountOptions): { destroy(): void } {
  const app = new App(container, options);
  return { destroy: () => app.destroy() };
}
