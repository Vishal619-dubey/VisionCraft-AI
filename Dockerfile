FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    fonts-dejavu-core \
    fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./

RUN npm install --omit=dev

RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir --upgrade pip && /opt/venv/bin/pip install --no-cache-dir edge-tts

ENV PATH="/opt/venv/bin:$PATH"
ENV NODE_ENV=production

COPY server/ .

RUN mkdir -p generated temp

EXPOSE 10000

CMD ["node", "server.js"]
