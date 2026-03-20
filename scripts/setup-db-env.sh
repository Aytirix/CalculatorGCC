#!/bin/bash

# Script pour gérer les mots de passe de base de données
# Les mots de passe sont persistés sur le serveur pour survivre aux redéploiements

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
PERSISTENT_ENV="/data/calculatorgcc/.env"

generate_password() {
	openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Si un .env persisté existe sur le serveur, l'utiliser directement
if [ -f "$PERSISTENT_ENV" ]; then
	echo "✓ Configuration persistée trouvée, utilisation de /data/calculatorgcc/.env"
	cp "$PERSISTENT_ENV" "$ENV_FILE"
	cp "$ENV_FILE" "/artifacts/build-time.env"
	echo "Configuration de la base de données terminée!"
	exit 0
fi

# Première installation : créer le .env
echo "Première installation : génération de la configuration..."
if [ ! -f "$ENV_FILE" ]; then
	cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

# DB_ROOT_PASSWORD
if [ -n "$DB_ROOT_PASSWORD" ]; then
	echo "✓ Mot de passe root récupéré depuis l'environnement Coolify"
	sed -i "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$DB_ROOT_PASSWORD|" "$ENV_FILE"
elif ! grep -q "^DB_ROOT_PASSWORD=.\+" "$ENV_FILE" 2>/dev/null; then
	DB_ROOT_PASSWORD=$(generate_password)
	sed -i "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$DB_ROOT_PASSWORD|" "$ENV_FILE"
	echo "✓ Mot de passe root généré"
fi

# DB_PASSWORD
if [ -n "$DB_PASSWORD" ]; then
	echo "✓ Mot de passe utilisateur récupéré depuis l'environnement Coolify"
	sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" "$ENV_FILE"
elif ! grep -q "^DB_PASSWORD=.\+" "$ENV_FILE" 2>/dev/null; then
	DB_PASSWORD=$(generate_password)
	sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" "$ENV_FILE"
	echo "✓ Mot de passe utilisateur généré"
fi

# Persister le .env sur le serveur pour les prochains déploiements
mkdir -p /data/calculatorgcc
cp "$ENV_FILE" "$PERSISTENT_ENV"
echo "✓ Configuration sauvegardée dans $PERSISTENT_ENV"

# Déterminer le protocole et hostname
HOSTNAME=$(grep "^HOSTNAME=" "$ENV_FILE" | cut -d '=' -f2)
ENABLE_SSL=$(grep "^ENABLE_SSL=" "$ENV_FILE" | cut -d '=' -f2)
HOSTNAME=${HOSTNAME:-localhost}

if [ "$ENABLE_SSL" = "true" ]; then
	PROTOCOL="https"
else
	PROTOCOL="http"
fi

echo ""
echo "Configuration de la base de données terminée!"
echo "Pour accéder à phpMyAdmin: $PROTOCOL://$HOSTNAME:3000/phpmyadmin"
