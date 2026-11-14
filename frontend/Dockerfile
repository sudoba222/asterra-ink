FROM node:22-alpine AS build
WORKDIR /app
# postinstall runs scripts/copy-static-assets.mjs, so the script must exist before npm ci
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app ./
EXPOSE 3000
CMD ["npx", "next", "start"]
