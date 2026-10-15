FROM node:20-alpine

WORKDIR /app

# tzdata so the TZ env var (set in docker-compose.yml) actually resolves to
# a real timezone instead of silently falling back to UTC - Alpine doesn't
# ship timezone data by default.
RUN apk add --no-cache tzdata

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "src/server.js"]
