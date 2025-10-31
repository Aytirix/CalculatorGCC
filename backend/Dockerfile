# Stage de base avec Node.js
FROM node:20-alpine AS base
WORKDIR /app

# Copier les fichiers de dépendances
COPY srcs/package*.json ./
RUN npm install

# Copier le code source
COPY srcs/ ./

# Stage de développement
FROM base AS development
# Installer tsx pour le développement avec hot-reload
CMD ["npm", "run", "dev"]

# Stage de build pour la production
FROM base AS builder
# Compiler TypeScript
RUN npm run build

# Stage de production
FROM node:20-alpine AS production
WORKDIR /app

# Copier uniquement les fichiers nécessaires
COPY srcs/package*.json ./
RUN npm ci --only=production

# Copier le code compilé
COPY --from=builder /app/dist ./dist

# Exposer le port
EXPOSE 7000

# Lancer l'application
CMD ["npm", "start"]
