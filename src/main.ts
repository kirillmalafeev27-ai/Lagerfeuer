// Автономная страница игры.

import { mountBonfires } from './embed.ts';
import bank from './shared/questions/bank.de.json';
import { LocalBankProvider } from './shared/questions/LocalBankProvider.ts';
import type { Question } from './shared/questions/types.ts';

const root = document.getElementById('app');
if (root) {
  const q = new URLSearchParams(location.search);
  const level = q.get('level');
  mountBonfires(root, {
    questions: new LocalBankProvider(bank as Question[]),
    level: level ? (level === 'inf' ? 7 : Number(level)) : undefined,
    dev: import.meta.env.DEV || q.has('dev'),
  });
}
