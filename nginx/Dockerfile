# -----------------------------
# Stage de build du frontend
# -----------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Installer les dépendances
COPY srcs/package*.json ./
RUN npm install
COPY srcs/ ./

# Build de l'app
RUN npm run build

# -----------------------------
# Stage Nginx prod
# -----------------------------
FROM nginx:alpine

# Installer les utilitaires (bash, curl, openssl…)
RUN apk update && apk add --no-cache \
    bash \
    curl \
    gettext \
    openssl \
    && rm -rf /var/cache/apk/*

# Certificats SSL auto-signés pour dev
RUN mkdir -p /etc/nginx/ssl/certificates && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/certificates/server.key \
        -out /etc/nginx/ssl/certificates/server.crt \
        -subj "/C=FR/ST=France/L=Paris/O=Simulator/CN=localhost"

# Copier le frontend buildé
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier les configs Nginx
COPY ./conf /etc/nginx/conf.d
COPY ./conf/nginx.conf.template /etc/nginx/nginx.conf.template

# Assurer les permissions
RUN chown -R nginx:nginx /etc/nginx && chmod -R 755 /etc/nginx

# Script d'entrée
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]