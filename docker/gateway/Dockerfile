FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm install typescript @types/node @types/ws @types/express @types/uuid --save-dev && \
    npx tsc && \
    rm -rf node_modules && \
    npm install --production

EXPOSE 18790

CMD ["node", "dist/gateway.js"]
