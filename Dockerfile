FROM node:20-slim

# Install system dependencies for media processing
RUN apt-get update && apt-get install -y \
  ffmpeg \
  python3 \
  curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .npmrc* ./
RUN npm install --omit=dev

COPY . .

# Create required directories
RUN mkdir -p sessions temp data plugins public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "--expose-gc", "index.js"]
