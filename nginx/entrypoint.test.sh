#!/bin/bash
# Tests du démarrage MIROIR AUTONOME de `entrypoint.sh`.
#
# Rien ne couvrait ce fichier : ni le décodage base64url du `state`, ni les
# quatre verdicts d'origine, ni la promesse « on AVERTIT sans refuser de
# démarrer » — qui est pourtant la correction centrale du commit.
#
# `curl` est remplacé par un bouchon dans le PATH. Le script va jusqu'au bout
# de sa phase miroir puis échoue sur /etc/nginx/conf.d (absent hors conteneur) :
# c'est sans importance, tout ce qu'on vérifie est déjà écrit sur la sortie —
# et le fait d'y ARRIVER est justement ce qui prouve qu'on n'a pas quitté.

set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
ENTRYPOINT="$ICI/entrypoint.sh"
BAC="$(mktemp -d)"
trap 'rm -rf "$BAC"' EXIT

mkdir -p "$BAC/bin"
cat > "$BAC/bin/curl" <<'STUB'
#!/bin/bash
case "$*" in
	*/auth/42*) printf '%s' "${FAUX_REDIRECT-}" ;;
	*) printf '%s\n%s\n%s' "${FAUX_BODY-{\"status\":\"ok\"}}" "${FAUX_CODE:-200}" "${FAUX_TYPE:-application/json}" ;;
esac
STUB
chmod +x "$BAC/bin/curl"
export PATH="$BAC/bin:$PATH"

b64url() { printf '%s' "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }

lancer() { # lancer <APP_DOMAIN> ; le reste vient de l'environnement
	APP_DOMAIN="$1" MIRROR_API_URL="https://principale.exemple.fr/api" \
		MIRROR_CHECK_RETRIES=1 ENABLE_SSL=false \
		bash "$ENTRYPOINT" true 2>&1
}

TOTAL=0; ECHECS=0
verifier() { # verifier <nom> <sortie> contient|absent <motif> ...
	local nom="$1" sortie="$2"; shift 2
	local ok=1 raison=""
	while [ $# -gt 0 ]; do
		case "$1" in
			contient) grep -qF -- "$2" <<<"$sortie" || { ok=0; raison="manque « $2 »"; } ;;
			absent)   grep -qF -- "$2" <<<"$sortie" && { ok=0; raison="ne devrait pas contenir « $2 »"; } ;;
		esac
		shift 2
	done
	TOTAL=$((TOTAL + 1))
	if [ "$ok" = 1 ]; then echo "  ok   $nom"; else echo "  ÉCHEC $nom — $raison"; ECHECS=$((ECHECS + 1)); fi
}

MIROIR="https://miroir.exemple.fr"

echo "== state : origine reconnue =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?client_id=u&state=$(b64url "{\"o\":\"$MIROIR\",\"t\":1}").sIgNaTuRe&redirect_uri=z"
S=$(lancer "$MIROIR")
verifier "annonce le retour sur le miroir" "$S" contient "renverra bien les visiteurs sur $MIROIR" absent "AVERTISSEMENT"

echo "== state : autre origine scellée =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=$(b64url '{"o":"https://rncp.theomouty.fr","t":1}').x&client_id=u"
S=$(lancer "$MIROIR")
verifier "avertit que l'origine n'est pas reconnue" "$S" \
	contient "ne reconnaît PAS cette origine" contient "ajouter exactement : $MIROIR"
verifier "AVERTIT sans refuser de démarrer" "$S" contient "Configuration file"

echo "== state : payload avec - et _ et remplissage à combler =="
# Le `tr '_-' '/+'` et le remplissage `=` sont la seule vraie mécanique du
# fichier : un alphabet inversé ou un remplissage oublié rend « illisible » un
# state parfaitement valide, donc un faux « non reconnu ».
BOURRAGE=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do
	CHARGE="$(b64url "{\"o\":\"$MIROIR\",\"t\":1,\"z\":\"$BOURRAGE\"}")"
	if grep -q '[-_]' <<<"$CHARGE" && [ $(( ${#CHARGE} % 4 )) -ne 0 ]; then break; fi
	BOURRAGE="${BOURRAGE}ÿþ"
done
grep -q '[-_]' <<<"$CHARGE" || echo "  (note : pas de - ni _ dans la charge, cas non exercé)"
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=${CHARGE}.sig&client_id=u"
S=$(lancer "$MIROIR")
verifier "relit un base64url complet (alphabet + remplissage)" "$S" \
	contient "renverra bien les visiteurs sur $MIROIR" absent "impossible de relire"

echo "== state : illisible =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=%%%%.sig&client_id=u"
S=$(lancer "$MIROIR")
verifier "dit qu'il ne sait pas relire, sans conclure" "$S" \
	contient "impossible de relire le state" absent "ne reconnaît PAS"

echo "== pas de state dans la redirection =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?client_id=u&redirect_uri=z"
S=$(lancer "$MIROIR")
verifier "signale une instance trop ancienne" "$S" contient "trop ancienne pour renvoyer les visiteurs ici"

echo "== aucune redirection =="
export FAUX_REDIRECT=""
S=$(lancer "$MIROIR")
verifier "dit qu'il n'a pas pu vérifier" "$S" \
	contient "n'a pas renvoyé de redirection" absent "ne reconnaît PAS"

echo "== APP_DOMAIN invalide =="
S=$(lancer "miroir.exemple.fr")
verifier "refuse de démarrer sans schéma" "$S" \
	contient "APP_DOMAIN doit commencer par http:// ou https://" absent "Vérification de"
S=$(lancer "")
verifier "refuse de démarrer si vide" "$S" contient "APP_DOMAIN est vide"

echo "== APP_DOMAIN avec slash final =="
# L'origine scellée par l'instance principale est normalisée (`new URL(x).origin`),
# sans slash final : sans le `%/` du script, un APP_DOMAIN copié depuis une barre
# d'adresse donnait un faux « non reconnue ».
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=$(b64url "{\"o\":\"$MIROIR\",\"t\":1}").x&client_id=u"
S=$(lancer "$MIROIR/")
verifier "tolère le slash final dans APP_DOMAIN" "$S" \
	contient "renverra bien les visiteurs sur $MIROIR" absent "ne reconnaît PAS"
# Même chose pour les espaces : une variable d'environnement en porte facilement.
S=$(lancer " $MIROIR ")
verifier "tolère les espaces autour d'APP_DOMAIN" "$S" \
	contient "renverra bien les visiteurs sur $MIROIR" absent "ne reconnaît PAS"

echo "== cible mal configurée / injoignable =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=$(b64url "{\"o\":\"$MIROIR\",\"t\":1}").x"
S=$(FAUX_BODY='<html>' FAUX_TYPE='text/html' lancer "$MIROIR")
verifier "refuse une cible qui ne répond pas du JSON" "$S" contient "au lieu de JSON" absent "Vérification de la"
S=$(FAUX_BODY='{"status":"ok","mode":"mirror"}' lancer "$MIROIR")
verifier "refuse une cible qui est elle-même un miroir" "$S" contient "la cible est elle-même un miroir"

echo
echo "$((TOTAL - ECHECS))/$TOTAL"
[ "$ECHECS" = 0 ]
