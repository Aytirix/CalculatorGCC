# -----------------------------
# Stage de build du frontend
# -----------------------------
FROM node:20-alpine AS builder
WORKDIR /app

ARG APP_DOMAIN=http://localhost:3000
ENV VITE_APP_DOMAIN=$APP_DOMAIN

# Installer les dépendances
COPY frontend/srcs/package*.json ./
RUN npm ci
COPY frontend/srcs/. ./
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build

# -----------------------------
# Stage Nginx prod
# -----------------------------

# Utiliser l'image officielle de Nginx
FROM nginx:alpine

# Mettre à jour les paquets et installer les dépendances nécessaires
RUN apk update && apk add --no-cache \
	bash \
	curl \
	gettext \
	openssl \
	&& rm -rf /var/cache/apk/*

# Créer le répertoire pour les certificats SSL
RUN mkdir -p /etc/nginx/ssl/certificates

# Générer des certificats SSL auto-signés pour le développement
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
	-keyout /etc/nginx/ssl/certificates/server.key \
	-out /etc/nginx/ssl/certificates/server.crt \
	-subj "/C=FR/ST=France/L=Paris/O=Simulator/CN=localhost"

# Copier le frontend buildé
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier le script d'entrée
COPY nginx/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Dockerfile Nginx
COPY nginx/conf /etc/nginx/conf.d
COPY nginx/conf/nginx.conf.template /etc/nginx/nginx.conf.template

# Assurer les bonnes permissions
RUN chown -R nginx:nginx /etc/nginx && \
	chmod -R 755 /etc/nginx

EXPOSE 3000

# Lancer le script d'entrée
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]