# Multi-stage: build the static site, then serve it. No SPA-fallback
# nginx config needed - this app has no client-side router (state-based
# view switching within one page, not separate routes).

FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Vite bakes VITE_* vars in at build time - this is the one value to
# change for a real deployment (see README's Deploying section).
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
