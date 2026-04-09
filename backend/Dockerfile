# Stage de base avec Node.js
FROM node:20-alpine AS base
WORKDIR /app

# Installer les outils requis par Prisma et le clonage MariaDB
RUN apk add --no-cache openssl bash mariadb-client

# Copier les fichiers de dépendances
COPY srcs/package*.json ./
RUN npm install

# Copier le schema Prisma et générer le client
COPY srcs/prisma ./prisma
RUN npx prisma generate

# Copier le code source
COPY srcs/ ./

# Stage de développement
FROM base AS development
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run dev"]

# Stage de build pour la production
FROM base AS builder
RUN npm run build

# Stage de production
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssl bash mariadb-client

COPY srcs/package*.json ./
COPY --from=builder /app/package-lock.json ./
RUN npm ci --only=production

# Copier le schema et migrations Prisma, puis générer le client
COPY srcs/prisma ./prisma
RUN npx prisma generate

# Copier le code compilé
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 7000

# Prépare la DB puis démarre
CMD ["/usr/local/bin/docker-entrypoint.sh"]
