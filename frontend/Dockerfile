FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS builder
ARG NEXT_PUBLIC_OUTBOUND_API_BASE=http://localhost:5000
ENV NEXT_PUBLIC_OUTBOUND_API_BASE=${NEXT_PUBLIC_OUTBOUND_API_BASE}
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
