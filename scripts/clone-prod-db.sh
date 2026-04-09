#!/bin/sh

set -eu

log() {
	printf '[db-clone] %s\n' "$*"
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

wait_for_db() {
	host="$1"
	port="$2"
	user="$3"
	password="$4"
	timeout="$5"
	start_time=$(date +%s)

	while ! mariadb-admin ping -h "$host" -P "$port" -u "$user" "-p$password" --silent >/dev/null 2>&1; do
		now=$(date +%s)
		elapsed=$((now - start_time))
		if [ "$elapsed" -ge "$timeout" ]; then
			log "Timeout en attendant la base $host:$port"
			exit 1
		fi
		sleep 2
	done
}

if ! is_true "${CLONE_FROM_PROD_ENABLED:-false}"; then
	log "Clonage depuis la prod desactive, on continue sans import."
	assert_target_configured \
		"${TARGET_DB_HOST:-mariadb}" \
		"${TARGET_DB_PORT:-3306}" \
		"${DB_NAME:-calculatorgcc}" \
		"${DB_ROOT_PASSWORD:-}" \
		"${REQUIRE_CONFIGURED_DB:-false}"
	exit 0
fi

TARGET_DB_HOST="${TARGET_DB_HOST:-mariadb}"
TARGET_DB_PORT="${TARGET_DB_PORT:-3306}"
TARGET_DB_NAME="${DB_NAME:-calculatorgcc}"
TARGET_DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-}"
REQUIRE_CONFIGURED_DB="${REQUIRE_CONFIGURED_DB:-false}"

PROD_DB_HOST="${PROD_DB_HOST:-}"
PROD_DB_PORT="${PROD_DB_PORT:-3306}"
PROD_DB_NAME="${PROD_DB_NAME:-$TARGET_DB_NAME}"
PROD_DB_USER="${PROD_DB_USER:-}"
PROD_DB_PASSWORD="${PROD_DB_PASSWORD:-}"

PROD_DB_WAIT_TIMEOUT="${PROD_DB_WAIT_TIMEOUT:-120}"
TARGET_DB_WAIT_TIMEOUT="${TARGET_DB_WAIT_TIMEOUT:-120}"

require_var "DB_ROOT_PASSWORD" "$TARGET_DB_ROOT_PASSWORD"
require_var "PROD_DB_HOST" "$PROD_DB_HOST"
require_var "PROD_DB_USER" "$PROD_DB_USER"
require_var "PROD_DB_PASSWORD" "$PROD_DB_PASSWORD"

log "Attente de la base source $PROD_DB_HOST:$PROD_DB_PORT..."
wait_for_db "$PROD_DB_HOST" "$PROD_DB_PORT" "$PROD_DB_USER" "$PROD_DB_PASSWORD" "$PROD_DB_WAIT_TIMEOUT"

log "Attente de la base cible $TARGET_DB_HOST:$TARGET_DB_PORT..."
wait_for_db "$TARGET_DB_HOST" "$TARGET_DB_PORT" "root" "$TARGET_DB_ROOT_PASSWORD" "$TARGET_DB_WAIT_TIMEOUT"

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

assert_target_configured \
	"$TARGET_DB_HOST" \
	"$TARGET_DB_PORT" \
	"$TARGET_DB_NAME" \
	"$TARGET_DB_ROOT_PASSWORD" \
	"$REQUIRE_CONFIGURED_DB"

log "Clonage termine avec succes."
