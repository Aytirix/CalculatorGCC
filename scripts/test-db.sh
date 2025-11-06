#!/bin/bash

# Script de test pour vérifier la configuration de la base de données

echo "🧪 Test de la configuration de la base de données"
echo "=================================================="
echo ""

# Vérifier si le fichier .env existe
if [ ! -f .env ]; then
    echo "❌ Le fichier .env n'existe pas"
    exit 1
fi

# Vérifier les variables de base de données
echo "✓ Fichier .env trouvé"

DB_ROOT_PASSWORD=$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f2)
DB_PASSWORD=$(grep DB_PASSWORD .env | cut -d '=' -f2)

if [ -z "$DB_ROOT_PASSWORD" ]; then
    echo "⚠️  DB_ROOT_PASSWORD est vide - sera généré au prochain démarrage"
else
    echo "✓ DB_ROOT_PASSWORD configuré"
fi

if [ -z "$DB_PASSWORD" ]; then
    echo "⚠️  DB_PASSWORD est vide - sera généré au prochain démarrage"
else
    echo "✓ DB_PASSWORD configuré"
fi

echo ""
echo "📋 Configuration actuelle:"
echo "  DB_NAME: $(grep DB_NAME .env | cut -d '=' -f2)"
echo "  DB_USER: $(grep DB_USER .env | cut -d '=' -f2)"

echo ""
echo "🔍 Vérification des containers Docker..."

# Vérifier si les containers tournent
if docker ps | grep -q "calculatorGCC_mariadb"; then
    echo "✓ Container MariaDB en cours d'exécution"
    
    # Tester la connexion à MariaDB
    if docker exec calculatorGCC_mariadb_dev mysqladmin ping -h localhost -u root -p"$DB_ROOT_PASSWORD" &> /dev/null || \
       docker exec calculatorGCC_mariadb_prod mysqladmin ping -h localhost -u root -p"$DB_ROOT_PASSWORD" &> /dev/null; then
        echo "✓ MariaDB répond correctement"
    else
        echo "⚠️  MariaDB ne répond pas (vérifier le mot de passe)"
    fi
else
    echo "⚠️  Container MariaDB non démarré"
    echo "   Lancer avec: make dev ou make prod"
fi

if docker ps | grep -q "calculatorGCC_phpmyadmin"; then
    echo "✓ Container phpMyAdmin en cours d'exécution"
else
    echo "⚠️  Container phpMyAdmin non démarré"
fi

echo ""
echo "🌐 URLs d'accès:"
HOSTNAME=$(grep HOSTNAME .env | cut -d '=' -f2)
ENABLE_SSL=$(grep ENABLE_SSL .env | cut -d '=' -f2)

if [ "$ENABLE_SSL" = "true" ]; then
    PROTOCOL="https"
else
    PROTOCOL="http"
fi

echo "  phpMyAdmin: $PROTOCOL://${HOSTNAME:-localhost}:3000/phpmyadmin"

echo ""
echo "✅ Test terminé"
