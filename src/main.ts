// Автономная страница игры.

import { balance } from './config/balance.ts';
import { mountBonfires } from './embed.ts';
import { AiQuestionProvider } from './shared/questions/AiQuestionProvider.ts';
import bank from './shared/questions/bank.de.json';
import { LocalBankProvider } from './shared/questions/LocalBankProvider.ts';
import type { Question } from './shared/questions/types.ts';

const root = document.getElementById('app');
if (root) {
  const q = new URLSearchParams(location.search);
  const level = q.get('level');
  const ai = balance.ai;
  // Вопросы сочиняет ИИ на сервере игры по выбранным темам; встроенный банк — запасной путь.
  const questions = new AiQuestionProvider({
    fallback: new LocalBankProvider(bank as Question[]),
    batchSize: ai.batch,
    refillAt: ai.refillAt,
    firstWaitMs: ai.firstWaitMs,
    nextWaitMs: ai.nextWaitMs,
    requestTimeoutMs: ai.requestTimeoutMs,
    retryWrongMin: ai.retryWrongMin,
    retryWrongMax: ai.retryWrongMax,
  });
  mountBonfires(root, {
    questions,
    level: level ? (level === 'inf' ? 7 : Number(level)) : undefined,
    dev: import.meta.env.DEV || q.has('dev'),
  });
}
