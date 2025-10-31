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
# Exposer le port Vite (par défaut 5173)
EXPOSE 5173
# Lancer Vite en mode dev avec host 0.0.0.0 pour être accessible depuis Docker
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage de build pour la production
FROM base AS builder
# Build l'application React avec Vite
RUN npm run build

# Stage de production avec Nginx léger
FROM nginx:alpine AS production

# Copier les fichiers buildés dans nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier une configuration nginx basique (sera override par le nginx principal)
RUN echo 'server { listen 3000; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
