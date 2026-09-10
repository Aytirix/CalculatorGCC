#!/bin/sh

set -eu

log() {
	printf '[backend-entrypoint] %s\n' "$*"
}

to_lower() {
	printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

is_true() {
	case "$(to_lower "${1:-false}")" in
		1|true|yes|on)
			return 0
			;;
		*)
			return 1
			;;
	esac
}

require_var() {
	name="$1"
	value="$2"
	if [ -z "$value" ]; then
		log "Variable requise manquante: $name"
		exit 1
	fi
}

wait_for_db() {
	host="$1"
	port="$2"
	user="$3"
	password="$4"
	timeout="$5"
	start_time=$(date +%s)

	while ! mariadb -h "$host" -P "$port" -u "$user" "-p$password" -e "SELECT 1;" >/dev/null 2>&1; do
		now=$(date +%s)
		elapsed=$((now - start_time))
		if [ "$elapsed" -ge "$timeout" ]; then
			log "Timeout en attendant la base $host:$port"
			exit 1
		fi
		sleep 2
	done
}

assert_target_configured() {
	host="$1"
	port="$2"
	db_name="$3"
	root_password="$4"
	require_configured="$5"

	if ! is_true "$require_configured"; then
		return 0
	fi

	configured_value="$(mariadb -N -B -h "$host" -P "$port" -u root "-p$root_password" "$db_name" -e "SELECT isConfigured FROM configuration WHERE id = 1 LIMIT 1;" 2>/dev/null || true)"

	case "$configured_value" in
		1)
			log "Verification OK: la base cible est configuree."
			;;
		*)
			log "Verification KO: la base cible n'est pas configuree apres preparation."
			exit 1
			;;
	esac
}

db_identity() {
	# Identifie le SERVEUR joint, et non le nom qui a servi a le joindre. Deux
	# alias peuvent designer la meme instance, et sur un reseau Docker partage le
	# DNS peut renvoyer un conteneur different d'un appel a l'autre : comparer les
	# noms, ou meme les IP resolues, ne prouve rien. `@@hostname` est le hostname
	# du conteneur mariadb, unique par instance.
	# Le `|| true` est indispensable : sous `set -e`, une substitution de commande
	# qui echoue tuerait le script avant que l'appelant puisse expliquer pourquoi.
	mariadb -N -B -h "$1" -P "$2" -u "$3" "-p$4" \
		-e "SELECT CONCAT(@@hostname, ':', @@port);" 2>/dev/null || true
}

TARGET_DB_HOST="${TARGET_DB_HOST:-mariadb}"
TARGET_DB_PORT="${TARGET_DB_PORT:-3306}"
TARGET_DB_NAME="${DB_NAME:-calculatorgcc}"
TARGET_DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-}"
REQUIRE_CONFIGURED_DB="${REQUIRE_CONFIGURED_DB:-false}"
TARGET_DB_WAIT_TIMEOUT="${TARGET_DB_WAIT_TIMEOUT:-120}"

require_var "DB_ROOT_PASSWORD" "$TARGET_DB_ROOT_PASSWORD"

TARGET_DB_USER="${DB_USER:-calculatorgcc_user}"
TARGET_DB_PASSWORD="${DB_PASSWORD:-}"

log "Attente de la base cible $TARGET_DB_HOST:$TARGET_DB_PORT (root)..."
wait_for_db "$TARGET_DB_HOST" "$TARGET_DB_PORT" "root" "$TARGET_DB_ROOT_PASSWORD" "$TARGET_DB_WAIT_TIMEOUT"

log "Attente que l'utilisateur $TARGET_DB_USER soit pret..."
wait_for_db "$TARGET_DB_HOST" "$TARGET_DB_PORT" "$TARGET_DB_USER" "$TARGET_DB_PASSWORD" "$TARGET_DB_WAIT_TIMEOUT"

if is_true "${CLONE_FROM_PROD_ENABLED:-false}"; then
	PROD_DB_HOST="${PROD_DB_HOST:-}"
	PROD_DB_PORT="${PROD_DB_PORT:-3306}"
	PROD_DB_NAME="${PROD_DB_NAME:-$TARGET_DB_NAME}"
	PROD_DB_USER="${PROD_DB_USER:-}"
	PROD_DB_PASSWORD="${PROD_DB_PASSWORD:-}"
	PROD_DB_WAIT_TIMEOUT="${PROD_DB_WAIT_TIMEOUT:-120}"

	require_var "PROD_DB_HOST" "$PROD_DB_HOST"
	require_var "PROD_DB_USER" "$PROD_DB_USER"
	require_var "PROD_DB_PASSWORD" "$PROD_DB_PASSWORD"

	log "Attente de la base source $PROD_DB_HOST:$PROD_DB_PORT..."
	wait_for_db "$PROD_DB_HOST" "$PROD_DB_PORT" "$PROD_DB_USER" "$PROD_DB_PASSWORD" "$PROD_DB_WAIT_TIMEOUT"

	# GARDE-FOU. La ligne suivante est un `DROP DATABASE` : si la cible se trouve
	# etre la prod, il n'y a pas de seconde chance. Le 2026-09-10, les deux stacks
	# exposaient chacune un hote nomme `mariadb` sur le reseau partage `coolify`,
	# et le DNS a envoye la prod sur la base de la pre-prod ; le clone aurait pu
	# partir dans l'autre sens. Seule la divergence des mots de passe root l'a
	# evite -- un rempart involontaire, sur lequel on refuse de continuer a parier.
	if [ "$(to_lower "$PROD_DB_HOST")" = "$(to_lower "$TARGET_DB_HOST")" ]; then
		log "REFUS DE CLONER: source et cible portent le meme nom d'hote ($PROD_DB_HOST)."
		exit 1
	fi

	source_identity=$(db_identity "$PROD_DB_HOST" "$PROD_DB_PORT" "$PROD_DB_USER" "$PROD_DB_PASSWORD")
	target_identity=$(db_identity "$TARGET_DB_HOST" "$TARGET_DB_PORT" "root" "$TARGET_DB_ROOT_PASSWORD")

	if [ -z "$source_identity" ] || [ -z "$target_identity" ]; then
		log "REFUS DE CLONER: impossible d'identifier la source ou la cible."
		exit 1
	fi

	if [ "$source_identity" = "$target_identity" ]; then
		log "REFUS DE CLONER: $PROD_DB_HOST et $TARGET_DB_HOST designent le MEME serveur ($source_identity)."
		log "Le clone aurait supprime la base qu'il devait copier. Verifiez DB_SHARED_ALIAS."
		exit 1
	fi

	log "Source ($source_identity) et cible ($target_identity) distinctes, clone autorise."

	escaped_db_name=$(printf '%s' "$TARGET_DB_NAME" | sed 's/`/``/g')

	log "Recreation de la base cible $TARGET_DB_NAME..."
	mariadb -h "$TARGET_DB_HOST" -P "$TARGET_DB_PORT" -u root "-p$TARGET_DB_ROOT_PASSWORD" <<SQL
DROP DATABASE IF EXISTS \`$escaped_db_name\`;
CREATE DATABASE \`$escaped_db_name\`;
SQL

	log "Import de $PROD_DB_NAME depuis $PROD_DB_HOST vers $TARGET_DB_NAME..."
	{
		printf 'SET FOREIGN_KEY_CHECKS=0;\n'
		mariadb-dump \
			-h "$PROD_DB_HOST" \
			-P "$PROD_DB_PORT" \
			-u "$PROD_DB_USER" \
			"-p$PROD_DB_PASSWORD" \
			--single-transaction \
			--quick \
			--skip-lock-tables \
			"$PROD_DB_NAME"
		printf '\nSET FOREIGN_KEY_CHECKS=1;\n'
	} | mariadb -h "$TARGET_DB_HOST" -P "$TARGET_DB_PORT" -u root "-p$TARGET_DB_ROOT_PASSWORD" "$TARGET_DB_NAME"
else
	log "Clonage depuis la prod desactive, on continue sans import."
fi

assert_target_configured \
	"$TARGET_DB_HOST" \
	"$TARGET_DB_PORT" \
	"$TARGET_DB_NAME" \
	"$TARGET_DB_ROOT_PASSWORD" \
	"$REQUIRE_CONFIGURED_DB"

log "Application des migrations Prisma..."
npx prisma migrate deploy

log "Demarrage du backend..."
exec node dist/server.js
