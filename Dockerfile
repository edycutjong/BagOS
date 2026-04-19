FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
EXPOSE 3050
CMD ["npx", "tsx", "src/index.ts", "--http"]
