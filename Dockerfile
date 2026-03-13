FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src ./src

