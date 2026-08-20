FROM node:22-alpine AS dependencies
WORKDIR /app
RUN npm install --global npm@10.9.8
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig*.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM build AS migration
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S sigr && adduser -S sigr -G sigr
COPY --from=production-dependencies --chown=sigr:sigr /app/node_modules ./node_modules
COPY --from=build --chown=sigr:sigr /app/dist ./dist
COPY --from=build --chown=sigr:sigr /app/prisma ./prisma
COPY --from=build --chown=sigr:sigr /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=sigr:sigr /app/package.json ./package.json
USER sigr
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
