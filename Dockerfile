# Backend only - never the frontend's files (see server.js, which is a
# pure API). Node 24 to match this project's development/testing
# environment (node:sqlite needs a recent Node).
FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY index.js server.js ./
COPY src ./src
COPY docs ./docs

EXPOSE 3001

CMD ["node", "server.js"]
