#!/bin/bash

# Script pour afficher les URLs basées sur la configuration actuelle

# Charger les variables du .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Valeurs par défaut
HOSTNAME=${HOSTNAME:-localhost}
ENABLE_SSL=${ENABLE_SSL:-true}

# Déterminer le protocole
if [ "$ENABLE_SSL" = "true" ]; then
    PROTOCOL="https"
else
    PROTOCOL="http"
fi

echo ""
echo "🌐 Configuration actuelle"
echo "════════════════════════════════════════"
echo "Hostname     : $HOSTNAME"
echo "SSL          : $ENABLE_SSL"
echo "Protocole    : $PROTOCOL"
echo ""
echo "📍 URLs d'accès"
echo "════════════════════════════════════════"
echo "Application  : $PROTOCOL://$HOSTNAME:3000"
echo "API          : $PROTOCOL://$HOSTNAME:3000/api"
echo "phpMyAdmin   : $PROTOCOL://$HOSTNAME:3000/phpmyadmin"
echo ""
echo "🗄️  Base de données"
echo "════════════════════════════════════════"
echo "MariaDB Host : mariadb (dans le réseau Docker)"
echo "MariaDB Port : 3306 (accessible uniquement depuis le réseau Docker)"
echo "Utilisateur  : root"
echo "Database     : ${DB_NAME:-calculatorgcc}"
echo ""
echo "🔧 Configuration OAuth 42"
echo "════════════════════════════════════════"
echo "Redirect URI : $PROTOCOL://$HOSTNAME:3000/api/auth/callback"
echo ""
