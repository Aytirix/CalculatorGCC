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

# Copier le script d'entrée
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Assurer les bonnes permissions
RUN chown -R nginx:nginx /etc/nginx && \
    chmod -R 755 /etc/nginx

# Lancer le script d'entrée
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]