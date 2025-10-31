#!/bin/bash

# Définir les valeurs par défaut
NODE_PROJET=${NODE_PROJET:-dev}
ENABLE_SSL=${ENABLE_SSL:-true}

# Déterminer le suffixe de configuration selon SSL
if [ "$ENABLE_SSL" = "true" ]; then
    SSL_SUFFIX=""
    SSL_STATUS="with SSL"
else
    SSL_SUFFIX="_nossl"
    SSL_STATUS="without SSL"
fi

# Construire le nom du fichier de configuration
CONFIG_FILE="frontend_${NODE_PROJET}${SSL_SUFFIX}.conf"

# Vérifier que le fichier de configuration existe
if [ ! -f "/etc/nginx/conf.d/$CONFIG_FILE" ]; then
    echo "Error: Configuration file $CONFIG_FILE not found!"
    echo "Available files:"
    ls -la /etc/nginx/conf.d/
    exit 1
fi

# Copier le fichier de configuration dans un emplacement accessible en écriture
cp "/etc/nginx/conf.d/$CONFIG_FILE" /etc/nginx/active_frontend.conf

# Copier et traiter le fichier de configuration template principal
envsubst '$NODE_PROJET' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Afficher le mode actif
echo "=========================================="
echo "Starting Nginx in $NODE_PROJET mode $SSL_STATUS"
echo "Configuration file: $CONFIG_FILE"
echo "=========================================="

# Tester la configuration nginx
nginx -t

# Lancer nginx
exec "$@"
