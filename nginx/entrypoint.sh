#!/bin/bash

# Définir les valeurs par défaut
NODE_PROJET=${NODE_PROJET:-dev}
ENABLE_SSL=${ENABLE_SSL:-true}
MIRROR_API_URL=${MIRROR_API_URL:-}

# ---------------------------------------------------------------------------
# MIROIR AUTONOME
#
# `MIRROR_API_URL` dans l'environnement bascule cette instance en miroir sans
# backend ni base : nginx sert le frontend et relaie l'API vers l'instance
# principale. Le mode « miroir applicatif », réglé depuis le panneau admin,
# reste indépendant — il suppose un backend et une base qui tournent.
#
# L'environnement PRIME : quand cette variable est posée, il n'y a ni base ni
# panneau ici pour dire le contraire.
# ---------------------------------------------------------------------------
if [ -n "$MIRROR_API_URL" ]; then
    NODE_PROJET="mirror"

    # Découpage de l'URL. Origine et chemin sont séparés : `proxy_pass` a besoin
    # de l'origine dans une variable (résolution DNS à chaud) et reconstruit le
    # chemin lui-même.
    # Espaces de garde : une variable d'environnement en porte facilement, et un
    # espace en fin d'URL passait jusque dans le chemin appelé.
    MIRROR_API_URL="$(printf '%s' "$MIRROR_API_URL" | tr -d '[:space:]')"
    MIRROR_API_URL="${MIRROR_API_URL%/}"

    # Le schéma est obligatoire : sans lui, tout le découpage ci-dessous part de
    # travers et l'erreur remontée serait « cible injoignable », qui n'aide pas.
    case "$MIRROR_API_URL" in
        http://*|https://*) ;;
        *)
            echo "[miroir] ERREUR DE CONFIGURATION : MIRROR_API_URL doit commencer par http:// ou https://"
            echo "         Reçu : $MIRROR_API_URL"
            exit 1
            ;;
    esac

    MIRROR_API_SCHEME="${MIRROR_API_URL%%://*}"
    MIRROR_API_REST="${MIRROR_API_URL#*://}"

    # Identifiants dans l'URL : refusés. Ils finiraient dans le SNI (`proxy_ssl_name
    # user`), donc dans une poignée de main TLS cassée — et dans les journaux.
    case "$MIRROR_API_REST" in
        *@*)
            echo "[miroir] ERREUR DE CONFIGURATION : MIRROR_API_URL ne doit pas contenir d'identifiants (user:mot-de-passe@)."
            exit 1
            ;;
    esac

    # Une query dans l'URL de base n'a pas de sens et se retrouverait collée au
    # chemin appelé (« /api?x=1/health »).
    case "$MIRROR_API_REST" in
        *\?*|*'#'*)
            echo "[miroir] ERREUR DE CONFIGURATION : MIRROR_API_URL ne doit porter ni query (?) ni ancre (#)."
            exit 1
            ;;
    esac
    MIRROR_API_HOST="${MIRROR_API_REST%%/*}"
    if [ "$MIRROR_API_REST" = "$MIRROR_API_HOST" ]; then
        MIRROR_API_PATH=""
    else
        MIRROR_API_PATH="/${MIRROR_API_REST#*/}"
    fi
    MIRROR_API_ORIGIN="${MIRROR_API_SCHEME}://${MIRROR_API_HOST}"

    # Le chemin `/api` est facile à oublier : sans lui le relais tombe sur le
    # frontend de la cible et renvoie du HTML au lieu de l'API.
    if [ -z "$MIRROR_API_PATH" ]; then
        MIRROR_API_PATH="/api"
        echo "[miroir] Aucun chemin dans MIRROR_API_URL, /api ajouté par défaut."
    fi

    # Le port du host doit rester dans l'en-tête Host, mais pas dans le SNI.
    MIRROR_API_SNI="${MIRROR_API_HOST%%:*}"

    # Résolveur DNS : celui de Docker par défaut, surchargeable pour un
    # déploiement hors Docker.
    MIRROR_RESOLVER=${MIRROR_RESOLVER:-127.0.0.11}

    # Le domaine PUBLIC de ce miroir. Obligatoire : c'est lui qui part dans le
    # `?origin=` de la connexion 42, et donc lui que l'instance principale doit
    # reconnaître. Sans lui, impossible de vérifier quoi que ce soit au démarrage.
    #
    # Espaces retirés puis slash final ôté, comme pour MIRROR_API_URL : l'origine
    # scellée par l'instance principale est normalisée (`new URL(x).origin`), et
    # une comparaison sur « https://x.fr/ » échouerait pour rien.
    APP_DOMAIN="$(printf '%s' "${APP_DOMAIN:-}" | tr -d '[:space:]')"
    APP_DOMAIN="${APP_DOMAIN%/}"
    if [ -z "$APP_DOMAIN" ]; then
        echo "[miroir] ERREUR DE CONFIGURATION : APP_DOMAIN est vide."
        echo "         Renseignez le domaine public de CE miroir (ex. https://miroir.exemple.fr)."
        exit 1
    fi

    # Forme contrôlée, et pas seulement la présence. Sans schéma, l'instance
    # principale ne peut pas lire cette valeur comme une origine : elle répondait
    # « non reconnue », et le message renvoyait l'exploitant vers son panneau —
    # lequel refuse la même chaîne en 400. Consigne impossible à suivre, sur une
    # forme que README.md et coolify-init-app.md documentent pourtant.
    case "$APP_DOMAIN" in
        http://*|https://*) ;;
        *)
            echo "[miroir] ERREUR DE CONFIGURATION : APP_DOMAIN doit commencer par http:// ou https://"
            echo "         Reçu : $APP_DOMAIN"
            exit 1
            ;;
    esac

    # Proxy de confiance devant le miroir, pour restaurer la vraie IP client.
    # Par défaut 127.0.0.1/32 : personne. Un miroir exposé en direct ne doit PAS
    # croire le X-Forwarded-For de ses visiteurs — sur un intranet ils sont en IP
    # privée, et pourraient donc choisir l'IP qu'on journalise et qu'on transmet.
    MIRROR_TRUSTED_PROXY=${MIRROR_TRUSTED_PROXY:-127.0.0.1/32}

    echo "=========================================="
    echo "Mode MIROIR AUTONOME"
    echo "  API relayée : ${MIRROR_API_ORIGIN}${MIRROR_API_PATH}"
    echo "  Résolveur   : ${MIRROR_RESOLVER}"
    echo "=========================================="

    # --- Contrôle de la cible -------------------------------------------------
    #
    # DEUX situations, deux réponses opposées :
    #
    #  - MAL CONFIGURÉ (URL sans schéma, chemin erroné, cible qui n'est pas une
    #    API CalculatorGCC) : on refuse de démarrer. Un redéploiement est de toute
    #    façon nécessaire pour corriger, et il n'y a pas de panneau ici pour le
    #    faire à chaud — autant échouer tout de suite avec la raison.
    #
    #  - CIBLE MOMENTANÉMENT INJOIGNABLE (elle redémarre, réseau coupé) : on
    #    démarre quand même. La configuration est bonne, elle le redeviendra ;
    #    nginx sert alors le frontend et `api-indisponible.html` en 503, ce qui
    #    est très exactement la dégradation prévue. Refuser de démarrer ici
    #    donnait un crash-loop et pas même le site statique — pire que la panne
    #    qu'on prétendait signaler.
    verifier_cible() {
        reponse=$(curl -sS --max-time 10 -w '\n%{http_code}\n%{content_type}' \
            "${MIRROR_API_ORIGIN}${MIRROR_API_PATH}/health" 2>&1) || return 2

        corps=$(printf '%s' "$reponse" | head -n -2)
        code=$(printf '%s' "$reponse" | tail -n 2 | head -n 1)
        type=$(printf '%s' "$reponse" | tail -n 1)

        # 5xx : la cible est là mais souffre — c'est passager, pas une erreur de
        # configuration. 4xx en revanche désigne une mauvaise URL.
        case "$code" in
            200) ;;
            5*) echo "[miroir] /health a répondu $code (la cible souffre)."; return 2 ;;
            *)
                echo "[miroir] ERREUR DE CONFIGURATION : /health a répondu $code."
                return 1
                ;;
        esac
        case "$type" in
            *application/json*) ;;
            *)
                echo "[miroir] ERREUR DE CONFIGURATION : /health a renvoyé « $type » au lieu de JSON."
                echo "         Il manque sans doute /api à la fin de MIRROR_API_URL."
                return 1
                ;;
        esac
        case "$corps" in
            *'"status"'*'"ok"'*) ;;
            *)
                echo "[miroir] ERREUR DE CONFIGURATION : la réponse n'est pas une API CalculatorGCC."
                echo "         Reçu : $corps"
                return 1
                ;;
        esac

        # Cible qui est ELLE-MÊME un miroir : refusé.
        #
        # Le contrôle passait, puisqu'un miroir répond bien « status: ok » en JSON —
        # et la chaîne s'installait en silence. Elle coûte deux relais par appel,
        # mais surtout le second miroir ne voit plus que l'adresse du premier :
        # journaux et rate-limit de la principale comptent alors tous les visiteurs
        # de la chaîne comme un seul. La marque est posée par le bloc /api/health de
        # frontend_mirror.conf, que seul un miroir sert.
        case "$corps" in
            *'"mode"'*'"mirror"'*)
                echo "[miroir] ERREUR DE CONFIGURATION : la cible est elle-même un miroir."
                echo "         MIRROR_API_URL doit désigner l'instance PRINCIPALE, pas un autre miroir."
                echo "         Reçu : $corps"
                return 1
                ;;
        esac
        # --- L'instance principale nous rendra-t-elle la main ? ---------------
        #
        # On ne lui demande pas un avis : on REJOUE le parcours. `/auth/42?origin=`
        # répond par une redirection vers 42 dont le paramètre `state` scelle
        # l'origine de retour. Si ce n'est pas la nôtre, nos visiteurs
        # atterriront chez elle en cliquant « Se connecter » — sans un mot, car
        # `initiateOAuth` retombe en silence sur son propre domaine.
        #
        # C'est la méthode de `checkReturnOrigin()` (mirror.service.ts), écrite
        # avant nous pour ce besoin exact, et c'est aussi celle qui a servi à
        # diagnostiquer la panne du 2026-09-11. Un premier jet interrogeait
        # `/setup/status?origin=` : réponse servie LOCALEMENT par un miroir
        # applicatif, qui s'auto-autorise — donc un feu vert sur la panne même
        # qu'on cherche à signaler.
        #
        # On AVERTIT sans refuser de démarrer. L'origine est un état DISTANT et
        # révocable par quelqu'un d'autre : avec `restart: unless-stopped`, sortir
        # en erreur mettrait le conteneur en boucle au premier redémarrage suivant
        # une révocation, et il ne servirait alors plus rien du tout — pas même le
        # bandeau d'explication. La doctrine du fichier, plus haut, dit la même
        # chose : on ne refuse de démarrer que si un redéploiement est nécessaire
        # pour corriger. Ici, tout se répare côté instance principale.
        avertir_origine() {
            echo "[miroir] AVERTISSEMENT : $1"
            echo "         Origine de ce miroir : $APP_DOMAIN"
            echo "         Tant que ce n'est pas réglé, « Se connecter » renverra vos visiteurs"
            echo "         sur ${MIRROR_API_ORIGIN}. Le site reste servi, avec un bandeau d'alerte."
        }

        redirection=$(curl -sS --max-time 10 -o /dev/null -w '%{redirect_url}' \
            --get --data-urlencode "origin=$APP_DOMAIN" \
            "${MIRROR_API_ORIGIN}${MIRROR_API_PATH}/auth/42" 2>/dev/null || true)

        if [ -z "$redirection" ]; then
            # Pas de redirection : la cible n'a pas démarré de connexion 42. Soit
            # elle n'est pas configurée, soit elle a répondu une erreur. On ne
            # sait pas — et on le dit, plutôt que d'inventer un verdict.
            avertir_origine "impossible de vérifier — /auth/42 n'a pas renvoyé de redirection."
            return 0
        fi

        etat=$(printf '%s' "$redirection" | sed -n 's/.*[?&]state=\([^&]*\).*/\1/p')
        if [ -z "$etat" ]; then
            avertir_origine "l'instance principale est trop ancienne pour renvoyer les visiteurs ici."
            return 0
        fi

        # base64url -> base64 : alphabet et remplissage. `cut -d.` isole la charge
        # utile, la signature HMAC ne nous sert à rien (c'est elle qui nous est
        # renvoyée, on ne la vérifie pas).
        charge=$(printf '%s' "$etat" | cut -d. -f1 | tr '_-' '/+')
        case $(( ${#charge} % 4 )) in
            2) charge="${charge}==" ;;
            3) charge="${charge}=" ;;
        esac
        # Espaces retirés avant comparaison : `JSON.stringify` n'en met pas, mais
        # rien ne garantit qu'un sérialiseur différent n'en mettra jamais, et un
        # faux « non reconnu » est précisément le genre de verdict erroné qu'on
        # cherche à supprimer. Même précaution que pour la réponse de /health.
        scelle=$(printf '%s' "$charge" | base64 -d 2>/dev/null | tr -d ' \t\n' || true)

        case "$scelle" in
            *"\"o\":\"$APP_DOMAIN\""*)
                echo "[miroir] L'instance principale renverra bien les visiteurs sur $APP_DOMAIN."
                ;;
            '')
                avertir_origine "impossible de relire le state renvoyé par l'instance principale."
                ;;
            *)
                avertir_origine "l'instance principale ne reconnaît PAS cette origine."
                echo "         Corrigez côté instance principale : panneau admin -> Origines autorisées"
                echo "         -> ajouter exactement : $APP_DOMAIN"
                ;;
        esac
        return 0
    }

    echo "[miroir] Vérification de ${MIRROR_API_ORIGIN}${MIRROR_API_PATH}/health ..."
    tentative=1
    total=${MIRROR_CHECK_RETRIES:-5}
    while :; do
        verifier_cible && { echo "[miroir] Cible valide."; break; }
        statut=$?
        # 1 = configuration fautive : inutile de réessayer, rien ne changera.
        [ "$statut" -eq 1 ] && exit 1
        if [ "$tentative" -ge "$total" ]; then
            echo "[miroir] Cible toujours injoignable après $total tentatives."
            echo "         La configuration est valide : on démarre quand même, et"
            echo "         « api-indisponible.html » sera servi en 503 jusqu'à son retour."
            break
        fi
        echo "[miroir] Tentative $tentative/$total échouée, nouvel essai dans 3 s..."
        tentative=$((tentative + 1))
        sleep 3
    done

    export MIRROR_API_ORIGIN MIRROR_API_PATH MIRROR_API_HOST MIRROR_API_SNI MIRROR_RESOLVER MIRROR_TRUSTED_PROXY
fi

# Déterminer le suffixe de configuration selon SSL
if [ "$ENABLE_SSL" = "true" ]; then
    SSL_SUFFIX=""
    SSL_STATUS="with SSL"
else
    SSL_SUFFIX="_nossl"
    SSL_STATUS="without SSL"
fi

# Construire le nom du fichier de configuration
CONFIG_FILE="frontend_${NODE_PROJET}${SSL_SUFFIX}.conf"

# Vérifier que le fichier de configuration existe
if [ ! -f "/etc/nginx/conf.d/$CONFIG_FILE" ]; then
    echo "Error: Configuration file $CONFIG_FILE not found!"
    echo "Available files:"
    ls -la /etc/nginx/conf.d/
    exit 1
fi

# Copier le fichier de configuration dans un emplacement accessible en écriture.
# En mode miroir, les valeurs de la cible y sont substituées : elles ne sont
# connues qu'au démarrage. On liste les variables une à une pour ne pas toucher
# aux `$remote_addr` et consorts, que nginx doit recevoir tels quels.
if [ -n "$MIRROR_API_URL" ]; then
    envsubst '$MIRROR_API_ORIGIN $MIRROR_API_PATH $MIRROR_API_HOST $MIRROR_API_SNI $MIRROR_RESOLVER $MIRROR_TRUSTED_PROXY' \
        < "/etc/nginx/conf.d/$CONFIG_FILE" > /etc/nginx/active_frontend.conf
else
    cp "/etc/nginx/conf.d/$CONFIG_FILE" /etc/nginx/active_frontend.conf
fi

# Copier et traiter le fichier de configuration template principal
envsubst '$NODE_PROJET' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Afficher le mode actif
echo "=========================================="
echo "Starting Nginx in $NODE_PROJET mode $SSL_STATUS"
echo "Configuration file: $CONFIG_FILE"
echo "=========================================="

# Tester la configuration nginx. Le code de retour était IGNORÉ : le message
# d'erreur défilait puis nginx était lancé quand même. Il refusait alors de
# démarrer de lui-même, mais la vérification ne servait à rien.
if ! nginx -t; then
    echo "Error: configuration nginx invalide (voir ci-dessus)."
    exit 1
fi

# Lancer nginx
exec "$@"
