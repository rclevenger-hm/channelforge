FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY app.js client.js index.html styles.css channel-forge-icon.svg README.md ./

ENV HOST=0.0.0.0
ENV PORT=5173

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

CMD ["node", "app.js"]
