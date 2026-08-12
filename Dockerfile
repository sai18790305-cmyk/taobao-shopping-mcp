FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    TAOBAO_PROFILE_DIR=/data/taobao-profile

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json README.md ./
COPY src ./src
RUN npm run build

RUN mkdir -p /data/taobao-profile
EXPOSE 3000
CMD ["node", "dist/server.js"]
