# ---------- Etapa 1: compilar ----------
FROM node:24-alpine AS build
WORKDIR /app

# Primero solo los manifiestos para aprovechar la caché de capas
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2: imagen de producción ----------
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    # Aviso informativo de kafkajs que no aplica (no producimos mensajes)
    KAFKAJS_NO_PARTITIONER_WARNING=1

# Solo dependencias de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Sin privilegios de root
USER node

# Render define PORT (por defecto 10000); la app lo lee en main.ts
EXPOSE 3000
CMD ["node", "dist/main.js"]
