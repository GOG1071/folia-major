FROM node:24-alpine

WORKDIR /app
ENV PORT=3000
ENV QQ_AUTH_STATE_PATH=/app/.auth-state/qq-device.json

# 后端由 npm 包提供，第三方 MIT 全文随包安装在
# node_modules/@yakult-green-tea/qq-music-api/LICENSE，不必再单独复制一份。
COPY deploy/docker/qq-api/package.json deploy/docker/qq-api/package-lock.json ./
RUN npm ci --omit=dev
RUN mkdir -p /app/.auth-state && chown node:node /app/.auth-state

ENV NODE_ENV=production
USER node
EXPOSE 3000

CMD ["node", "node_modules/@yakult-green-tea/qq-music-api/dist/src/app.js"]
