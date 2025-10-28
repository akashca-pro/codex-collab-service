#stage 1: build
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g npm@latest

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

#stage 2 runtime

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist /app/src

COPY --from=builder /app/node_modules /app/node_modules

EXPOSE 50054 5001

CMD [ "node", "src/index.js"]