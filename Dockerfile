FROM node:22-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Production image
FROM node:22-slim
WORKDIR /app
COPY --from=base /app/.output /app/.output
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/package.json /app/package.json

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
