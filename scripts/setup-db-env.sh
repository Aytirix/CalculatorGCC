#!/bin/bash

# Script pour générer les mots de passe de base de données s'ils ne sont pas configurés

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# Fonction pour générer un mot de passe aléatoire
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Créer le fichier .env s'il n'existe pas
if [ ! -f "$ENV_FILE" ]; then
    echo "Création du fichier .env à partir de .env.example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

# Vérifier si DB_ROOT_PASSWORD est vide ou non défini
if ! grep -q "^DB_ROOT_PASSWORD=.\+" "$ENV_FILE" 2>/dev/null; then
    echo "Génération du mot de passe root MariaDB..."
    DB_ROOT_PWD=$(generate_password)
    
    # Remplacer ou ajouter DB_ROOT_PASSWORD dans .env
    if grep -q "^DB_ROOT_PASSWORD=" "$ENV_FILE"; then
        sed -i "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$DB_ROOT_PWD|" "$ENV_FILE"
    else
        echo "DB_ROOT_PASSWORD=$DB_ROOT_PWD" >> "$ENV_FILE"
    fi
    
    echo "✓ Mot de passe root généré: $DB_ROOT_PWD"
else
    echo "✓ Mot de passe root déjà configuré"
fi

# Vérifier si DB_PASSWORD est vide ou non défini
if ! grep -q "^DB_PASSWORD=.\+" "$ENV_FILE" 2>/dev/null; then
    echo "Génération du mot de passe utilisateur MariaDB..."
    DB_USER_PWD=$(generate_password)
    
    # Remplacer ou ajouter DB_PASSWORD dans .env
    if grep -q "^DB_PASSWORD=" "$ENV_FILE"; then
        sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_USER_PWD|" "$ENV_FILE"
    else
        echo "DB_PASSWORD=$DB_USER_PWD" >> "$ENV_FILE"
    fi
    
    echo "✓ Mot de passe utilisateur généré: $DB_USER_PWD"
else
    echo "✓ Mot de passe utilisateur déjà configuré"
fi

echo ""
echo "Configuration de la base de données terminée!"
echo "Les mots de passe ont été sauvegardés dans le fichier .env"
echo ""

# Déterminer le protocole et hostname
HOSTNAME=$(grep "^HOSTNAME=" "$ENV_FILE" | cut -d '=' -f2)
ENABLE_SSL=$(grep "^ENABLE_SSL=" "$ENV_FILE" | cut -d '=' -f2)
HOSTNAME=${HOSTNAME:-localhost}

if [ "$ENABLE_SSL" = "true" ]; then
    PROTOCOL="https"
else
    PROTOCOL="http"
fi

echo "Pour accéder à phpMyAdmin: $PROTOCOL://$HOSTNAME:3000/phpmyadmin"
echo "  - Utilisateur: root"
echo "  - Mot de passe: (voir DB_ROOT_PASSWORD dans .env)"
