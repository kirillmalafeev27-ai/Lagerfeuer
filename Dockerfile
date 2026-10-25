# Образ «Костров»: игра (dist/) и сервер вопросов (dist-server/). Northflank собирает его прямо из
# репозитория («Build type: Dockerfile»), как Morskoy и «Льдины».

# ── сборка: нужны dev-зависимости (Vite, TypeScript) ──
FROM node:22-alpine AS build
WORKDIR /app
# Сначала только манифесты: пока зависимости не меняются, слой npm остаётся в кеше.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

# ── запуск: только собранное, без node_modules — сервер на встроенных модулях Node ──
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# В образе Node уже есть непривилегированный пользователь node.
USER node

# Northflank сам PORT не задаёт: 3000 — значение по умолчанию, тот же порт — в Ports & DNS.
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/index.js"]
