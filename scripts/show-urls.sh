#!/bin/bash

# Script pour afficher les URLs basées sur la configuration actuelle

# Charger les variables du .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Valeurs par défaut
APP_DOMAIN=${APP_DOMAIN:-http://localhost:3000}

echo ""
echo "🌐 Configuration actuelle"
echo "════════════════════════════════════════"
echo "App Domain   : $APP_DOMAIN"
echo "SSL          : ${ENABLE_SSL:-false}"
echo ""
echo "📍 URLs d'accès"
echo "════════════════════════════════════════"
echo "Application  : $APP_DOMAIN"
echo "API          : $APP_DOMAIN/api"
echo "phpMyAdmin   : $APP_DOMAIN/phpmyadmin"
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
echo "Redirect URI : $APP_DOMAIN/api/auth/callback"
echo ""
