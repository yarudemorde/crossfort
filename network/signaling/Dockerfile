FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.cjs ./
USER node
ENV PORT=9000
EXPOSE 9000
CMD ["node", "server.cjs"]
