#!/bin/bash

# Script pour gérer les mots de passe de base de données
# Les mots de passe sont persistés sur le serveur pour survivre aux redéploiements

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
PERSISTENT_ENV="/data/calculatorgcc/.env"

BACKEND_ENV_FILE="backend/srcs/.env"
BACKEND_ENV_EXAMPLE="backend/srcs/.env.example"

generate_password() {
	openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

escape_sed_replacement() {
	printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

set_env_var() {
	local file="$1"
	local key="$2"
	local value="$3"
	local escaped_value
	escaped_value=$(escape_sed_replacement "$value")

	if grep -q "^${key}=" "$file" 2>/dev/null; then
		sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$file"
	else
		echo "${key}=${value}" >> "$file"
	fi
}

setup_backend_env() {
	if [ ! -d "backend/srcs" ]; then
		return 0
	fi

	# Créer le fichier si besoin pour éviter l'erreur docker compose env_file
	if [ ! -f "$BACKEND_ENV_FILE" ]; then
		cp "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV_FILE"
		echo "✓ Fichier backend/srcs/.env créé depuis l'exemple"
	fi

	# JWT_SECRET : générer si absent ou placeholder
	if [ -n "$JWT_SECRET" ]; then
		set_env_var "$BACKEND_ENV_FILE" "JWT_SECRET" "$JWT_SECRET"
		echo "✓ JWT_SECRET récupéré depuis l'environnement"
		return 0
	fi

	local current_jwt_secret
	current_jwt_secret=$(grep -E "^JWT_SECRET=" "$BACKEND_ENV_FILE" 2>/dev/null | head -n 1 | cut -d '=' -f2-)
	if [ -z "$current_jwt_secret" ] || [ "$current_jwt_secret" = "your_jwt_secret_here" ]; then
		JWT_SECRET=$(generate_password)
		set_env_var "$BACKEND_ENV_FILE" "JWT_SECRET" "$JWT_SECRET"
		echo "✓ JWT_SECRET généré"
	fi
}

# Toujours s'assurer que le backend a son .env (requis par docker-compose.prod.yml)
setup_backend_env

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
	set_env_var "$ENV_FILE" "DB_ROOT_PASSWORD" "$DB_ROOT_PASSWORD"
elif ! grep -q "^DB_ROOT_PASSWORD=.\+" "$ENV_FILE" 2>/dev/null; then
	DB_ROOT_PASSWORD=$(generate_password)
	set_env_var "$ENV_FILE" "DB_ROOT_PASSWORD" "$DB_ROOT_PASSWORD"
	echo "✓ Mot de passe root généré"
fi

# DB_PASSWORD
if [ -n "$DB_PASSWORD" ]; then
	echo "✓ Mot de passe utilisateur récupéré depuis l'environnement Coolify"
	set_env_var "$ENV_FILE" "DB_PASSWORD" "$DB_PASSWORD"
elif ! grep -q "^DB_PASSWORD=.\+" "$ENV_FILE" 2>/dev/null; then
	DB_PASSWORD=$(generate_password)
	set_env_var "$ENV_FILE" "DB_PASSWORD" "$DB_PASSWORD"
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
