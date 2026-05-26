FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json package-lock.json ./
RUN npm ci --omit=dev

EXPOSE 4321

CMD ["node", "dist/server/entry.mjs"]
