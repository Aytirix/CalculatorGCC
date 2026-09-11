#!/bin/bash
# Tests du démarrage MIROIR AUTONOME de `entrypoint.sh`.
#
# Rien ne couvrait ce fichier : ni le décodage base64url du `state`, ni les
# quatre verdicts d'origine, ni la promesse « on AVERTIT sans refuser de
# démarrer » — qui est pourtant la correction centrale du commit.
#
# LIMITE CONNUE : le remplissage `=` n'est pas détectable sur un hôte GNU, dont
# `base64 -d` accepte une entrée non alignée. Celui de l'image `nginx:alpine`
# (busybox) est strict — « base64: truncated input » — donc le code de remplissage
# porte bel et bien en production, mais ce test ne peut pas le prouver ici. Le
# vérifier exigerait de lancer ce fichier DANS l'image.
#
# `curl` est remplacé par un bouchon dans le PATH. Le script va jusqu'au bout
# de sa phase miroir puis échoue sur /etc/nginx/conf.d (absent hors conteneur) :
# c'est sans importance, tout ce qu'on vérifie est déjà écrit sur la sortie —
# et le fait d'y ARRIVER est justement ce qui prouve qu'on n'a pas quitté.

set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
ENTRYPOINT="$ICI/entrypoint.sh"
BAC="$(mktemp -d)" || exit 1
# Sans ce contrôle, un `mktemp` en échec laisse BAC vide — que `set -u` ne
# rattrape pas, la variable étant définie — et le bouchon s'écrit dans /bin/curl.
[ -n "$BAC" ] && [ -d "$BAC" ] || { echo "mktemp -d a échoué"; exit 1; }
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

# Code de retour du dernier `lancer`. Il était JETÉ par `lancer …`, si bien
# que la promesse centrale du correctif — « on AVERTIT sans refuser de démarrer »
# — n'était gardée que sur une branche sur quatre : trois mutants transformant un
# avertissement en `exit 1`, ou l'inverse, passaient au vert. Le refus de chaîner
# deux miroirs, ajouté plus tôt dans cette même boucle, n'était plus gardé du tout.
RC=0
S=""
# Sortie passée par FICHIER, et non par substitution de commande : `lancer …`
# exécute la fonction dans un sous-shell, où le `RC=$?` est perdu au retour. Le
# code de retour revenait alors toujours à 0 et toute assertion de sortie devenait
# vaine — le piège même que ce garde-fou existe pour éviter.
lancer() { # lancer <APP_DOMAIN> ; pose $S (sortie) et $RC (code de retour)
	APP_DOMAIN="$1" MIRROR_API_URL="https://principale.exemple.fr/api" \
		MIRROR_CHECK_RETRIES=1 ENABLE_SSL=false \
		bash "$ENTRYPOINT" true >"$BAC/sortie" 2>&1
	RC=$?
	S=$(cat "$BAC/sortie")
}

# Le script va jusqu'au bout de sa phase miroir puis échoue sur /etc/nginx/conf.d,
# absent hors conteneur : ATTEINDRE ce point est précisément ce qui prouve qu'on
# n'a pas quitté avant. `demarre` le vérifie, `quitte` vérifie l'inverse.
MARQUE_DEMARRAGE="Configuration file"

TOTAL=0; ECHECS=0
verifier() { # verifier <nom> <sortie> contient|absent <motif> ...
	local nom="$1" sortie="$2"; shift 2
	local ok=1 raison=""
	while [ $# -gt 0 ]; do
		case "$1" in
			contient) grep -qF -- "$2" <<<"$sortie" || { ok=0; raison="manque « $2 »"; }; shift 2 ;;
			absent)   grep -qF -- "$2" <<<"$sortie" && { ok=0; raison="ne devrait pas contenir « $2 »"; }; shift 2 ;;
			# A poursuivi jusqu'à la phase nginx : le miroir est servi.
			demarre)  grep -qF -- "$MARQUE_DEMARRAGE" <<<"$sortie" \
				|| { ok=0; raison="a QUITTÉ au lieu de démarrer (rc=$RC)"; }; shift ;;
			# A quitté dans la phase miroir, sans atteindre nginx.
			quitte)   { grep -qF -- "$MARQUE_DEMARRAGE" <<<"$sortie" || [ "$RC" != 1 ]; } \
				&& { ok=0; raison="aurait dû quitter en 1 (rc=$RC)"; }; shift ;;
		esac
	done
	TOTAL=$((TOTAL + 1))
	if [ "$ok" = 1 ]; then echo "  ok   $nom"; else echo "  ÉCHEC $nom — $raison"; ECHECS=$((ECHECS + 1)); fi
}

MIROIR="https://miroir.exemple.fr"

echo "== state : origine reconnue =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?client_id=u&state=$(b64url "{\"o\":\"$MIROIR\",\"t\":1}").sIgNaTuRe&redirect_uri=z"
lancer "$MIROIR"
verifier "annonce le retour sur le miroir" "$S" \
	contient "renverra bien les visiteurs sur $MIROIR" absent "AVERTISSEMENT" demarre

echo "== state : autre origine scellée =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=$(b64url '{"o":"https://rncp.theomouty.fr","t":1}').x&client_id=u"
lancer "$MIROIR"
verifier "avertit que l'origine n'est pas reconnue" "$S" \
	contient "ne reconnaît PAS cette origine" contient "ajouter exactement : $MIROIR"
verifier "AVERTIT sans refuser de démarrer" "$S" demarre

echo "== state : alphabet base64url et remplissage =="
# Le `tr '_-' '/+'` et le remplissage `=` sont la seule vraie mécanique du
# fichier : un alphabet inversé ou un remplissage oublié rend « illisible » un
# state parfaitement valide, donc un faux « non reconnu ».
#
# Les caractères `-` et `_` doivent tomber DANS la valeur de `o`, sinon leur
# corruption ne change pas ce qu'on vérifie. Une version antérieure de ce test
# les plaçait dans un champ de bourrage ajouté APRÈS `o` : elle annonçait couvrir
# l'alphabet et ne couvrait rien — surestimation de couverture relevée en audit.
# D'où une origine biscornue : aucune charge ASCII réaliste ne produit ces
# caractères, mais le chemin de code, lui, doit rester juste.
ETRANGE="https://a>>>b.exemple.fr"
CHARGE="$(b64url "{\"o\":\"$ETRANGE\",\"t\":1}")"
grep -q '[-_]' <<<"$CHARGE" || echo "  (note : ni - ni _ dans la charge, alphabet non exercé)"
[ $(( ${#CHARGE} % 4 )) -ne 0 ] || echo "  (note : charge déjà alignée, remplissage non exercé)"
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=${CHARGE}.sig&client_id=u"
lancer "$ETRANGE"
verifier "relit un base64url complet (alphabet + remplissage)" "$S" demarre \
	contient "renverra bien les visiteurs sur $ETRANGE" absent "impossible de relire"

echo "== state : illisible =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=%%%%.sig&client_id=u"
lancer "$MIROIR"
verifier "dit qu'il ne sait pas relire, sans conclure" "$S" demarre \
	contient "impossible de relire le state" absent "ne reconnaît PAS"

echo "== pas de state dans la redirection =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?client_id=u&redirect_uri=z"
lancer "$MIROIR"
verifier "signale une instance trop ancienne, et démarre" "$S" \
	contient "trop ancienne pour renvoyer les visiteurs ici" demarre

echo "== aucune redirection =="
export FAUX_REDIRECT=""
lancer "$MIROIR"
verifier "dit qu'il n'a pas pu vérifier" "$S" demarre \
	contient "n'a pas renvoyé de redirection" absent "ne reconnaît PAS"

echo "== APP_DOMAIN invalide =="
lancer "miroir.exemple.fr"
verifier "refuse de démarrer sans schéma" "$S" quitte \
	contient "APP_DOMAIN doit commencer par http:// ou https://" absent "Vérification de"
lancer ""
verifier "refuse de démarrer si vide" "$S" contient "APP_DOMAIN est vide" quitte

echo "== APP_DOMAIN avec slash final =="
# L'origine scellée par l'instance principale est normalisée (`new URL(x).origin`),
# sans slash final : sans le `%/` du script, un APP_DOMAIN copié depuis une barre
# d'adresse donnait un faux « non reconnue ».
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=$(b64url "{\"o\":\"$MIROIR\",\"t\":1}").x&client_id=u"
lancer "$MIROIR/"
verifier "tolère le slash final dans APP_DOMAIN" "$S" demarre \
	contient "renverra bien les visiteurs sur $MIROIR" absent "ne reconnaît PAS"
# Même chose pour les espaces : une variable d'environnement en porte facilement.
lancer " $MIROIR "
verifier "tolère les espaces autour d'APP_DOMAIN" "$S" demarre \
	contient "renverra bien les visiteurs sur $MIROIR" absent "ne reconnaît PAS"

echo "== cible mal configurée / injoignable =="
export FAUX_REDIRECT="https://api.intra.42.fr/oauth/authorize?state=$(b64url "{\"o\":\"$MIROIR\",\"t\":1}").x"
FAUX_BODY='<html>' FAUX_TYPE='text/html' lancer "$MIROIR"
unset FAUX_BODY FAUX_TYPE
verifier "refuse une cible qui ne répond pas du JSON" "$S" \
	contient "au lieu de JSON" absent "Vérification de la" quitte
FAUX_BODY='{"status":"ok","mode":"mirror"}' lancer "$MIROIR"
unset FAUX_BODY
# Le refus de chaîner deux miroirs date d'un commit antérieur de cette boucle ;
# sans `quitte`, un mutant le réduisant à un simple message passait au vert.
verifier "refuse une cible qui est elle-même un miroir" "$S" \
	contient "la cible est elle-même un miroir" quitte

echo
echo "$((TOTAL - ECHECS))/$TOTAL"
[ "$ECHECS" = 0 ]
