FROM node:20-alpine

WORKDIR /app

# Install runtime deps
RUN npm init -y >/dev/null 2>&1 \
 && npm install --no-audit --no-fund @hocuspocus/server@2.13.0 yjs@13.6.19 >/dev/null 2>&1 \
 && rm -rf /root/.npm

COPY server.js ./server.js

EXPOSE 4100

CMD ["node", "server.js"]


