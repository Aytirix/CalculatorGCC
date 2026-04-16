.PHONY: help dev prod stop clean logs logs-dev logs-prod restart-dev restart-prod build-dev build-prod ps status check check-build prisma-generate prisma-push prisma-migrate prisma-studio restart-backend

# Détecter la commande docker compose disponible
DOCKER_COMPOSE := $(shell docker compose version > /dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

# Couleurs pour l'affichage
GREEN  := \033[0;32m
BLUE   := \033[0;34m
YELLOW := \033[0;33m
RED    := \033[0;31m
RESET  := \033[0m

##@ Aide

help: ## Afficher l'aide
	@echo "$(BLUE)═══════════════════════════════════════════════════════$(RESET)"
	@echo "$(GREEN)           Simulator - Commandes Docker$(RESET)"
	@echo "$(BLUE)═══════════════════════════════════════════════════════$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf ""} /^[a-zA-Z_-]+:.*?##/ { printf "  $(YELLOW)%-15s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""

##@ Développement

dev: ## Démarrer l'application en mode développement
	@echo "$(GREEN)🚀 Démarrage en mode DÉVELOPPEMENT...$(RESET)"
	@bash ./scripts/setup-db-env.sh
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml up --build -d
	@echo ""
	@echo "$(GREEN)✅ Application démarrée !$(RESET)"
	@echo ""
	@bash ./scripts/show-urls.sh || true
	@echo ""

build-dev: ## Rebuild les images en mode développement
	@echo "$(GREEN)🔨 Reconstruction des images de développement...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml build --no-cache

check: ## Vérifier les erreurs TypeScript dans les conteneurs déjà lancés (rapide)
	@echo "$(BLUE)🔍 [1/2] TypeScript frontend...$(RESET)"; \
	docker exec calculatorGCC_frontend_dev npx tsc --noEmit 2>&1 && FRONTEND_OK=1 || FRONTEND_OK=0; \
	echo "$(BLUE)🔍 [2/2] TypeScript backend...$(RESET)"; \
	docker exec calculatorGCC_backend_dev npx tsc --noEmit 2>&1 && BACKEND_OK=1 || BACKEND_OK=0; \
	echo ""; \
	echo "$(BLUE)═══════════════════════════════════$(RESET)"; \
	echo "$(BLUE)           Résultats du check$(RESET)"; \
	echo "$(BLUE)═══════════════════════════════════$(RESET)"; \
	if [ "$$FRONTEND_OK" = "1" ]; then echo "  $(GREEN)✅ Frontend : OK$(RESET)"; else echo "  $(RED)❌ Frontend : ERREUR$(RESET)"; fi; \
	if [ "$$BACKEND_OK" = "1" ]; then echo "  $(GREEN)✅ Backend  : OK$(RESET)"; else echo "  $(RED)❌ Backend  : ERREUR$(RESET)"; fi; \
	echo "$(BLUE)═══════════════════════════════════$(RESET)"; \
	[ "$$FRONTEND_OK" = "1" ] && [ "$$BACKEND_OK" = "1" ]

check-build: ## Vérifier via docker build complet (lent, sans conteneurs lancés)
	@echo "$(BLUE)🔍 [1/2] Build frontend (TypeScript + Vite)...$(RESET)"
	@DOCKER_BUILDKIT=1 docker build \
		--target builder \
		-f nginx/Dockerfile \
		--progress=plain \
		--no-cache \
		. 2>&1 && FRONTEND_OK=1 || FRONTEND_OK=0; \
	echo "$(BLUE)🔍 [2/2] Build backend (TypeScript)...$(RESET)"; \
	DOCKER_BUILDKIT=1 docker build \
		--target builder \
		-f backend/Dockerfile \
		--progress=plain \
		--no-cache \
		./backend 2>&1 && BACKEND_OK=1 || BACKEND_OK=0; \
	echo ""; \
	echo "$(BLUE)═══════════════════════════════════$(RESET)"; \
	echo "$(BLUE)           Résultats du check$(RESET)"; \
	echo "$(BLUE)═══════════════════════════════════$(RESET)"; \
	if [ "$$FRONTEND_OK" = "1" ]; then echo "  $(GREEN)✅ Frontend : OK$(RESET)"; else echo "  $(RED)❌ Frontend : ERREUR$(RESET)"; fi; \
	if [ "$$BACKEND_OK" = "1" ]; then echo "  $(GREEN)✅ Backend  : OK$(RESET)"; else echo "  $(RED)❌ Backend  : ERREUR$(RESET)"; fi; \
	echo "$(BLUE)═══════════════════════════════════$(RESET)"; \
	[ "$$FRONTEND_OK" = "1" ] && [ "$$BACKEND_OK" = "1" ]

restart-dev: ## Redémarrer les services en mode développement
	@echo "$(YELLOW)🔄 Redémarrage des services de développement...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml restart
	@echo "$(GREEN)✅ Services redémarrés !$(RESET)"

logs-dev: ## Voir les logs en mode développement
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml logs -f

##@ Production

prod: ## Démarrer l'application en mode production
	@echo "$(GREEN)🚀 Démarrage en mode PRODUCTION...$(RESET)"
	@bash ./scripts/setup-db-env.sh
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml build
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml up -d
	@echo ""
	@echo "$(GREEN)✅ Application démarrée en production !$(RESET)"
	@echo ""
	@bash ./scripts/show-urls.sh || true
	@echo "$(YELLOW)⚠️  Note: Les certificats SSL sont auto-signés.$(RESET)"

build-prod: ## Rebuild les images en mode production
	@echo "$(GREEN)🔨 Reconstruction des images de production...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml build --no-cache

restart-prod: ## Redémarrer les services en mode production
	@echo "$(YELLOW)🔄 Redémarrage des services de production...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart
	@echo "$(GREEN)✅ Services redémarrés !$(RESET)"

logs-prod: ## Voir les logs en mode production
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f

##@ Gestion

stop: ## Arrêter tous les conteneurs (dev et prod)
	@echo "$(RED)🛑 Arrêt de tous les conteneurs...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml down 2>/dev/null || true
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml down 2>/dev/null || true
	@echo "$(GREEN)✅ Tous les conteneurs ont été arrêtés$(RESET)"

clean: ## Arrêter et supprimer tous les conteneurs, volumes et images et node_modules
	@echo "$(RED)🧹 Nettoyage complet...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml down -v --rmi all 2>/dev/null || true
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml down -v --rmi all 2>/dev/null || true
	@echo "$(GREEN)✅ Nettoyage terminé$(RESET)"

fclean: ## Nettoyage total (Docker + node_modules + .env)
	@echo "$(RED)⚠️  ATTENTION: Cette commande va supprimer:$(RESET)"
	@echo "  - Tous les conteneurs Docker"
	@echo "  - Tous les volumes Docker"
	@echo "  - Toutes les images Docker"
	@echo "  - Les node_modules du frontend et backend"
	@echo "  - Le fichier .env à la racine"
	@echo "  - Le fichier .env du backend"
	@echo ""
	@printf "$(YELLOW)Êtes-vous sûr ? [y/N] $(RESET)"; \
	read confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		echo "$(RED)🗑️  Suppression en cours...$(RESET)"; \
		$(DOCKER_COMPOSE) -f docker-compose.dev.yml down -v --rmi all 2>/dev/null || true; \
		$(DOCKER_COMPOSE) -f docker-compose.prod.yml down -v --rmi all 2>/dev/null || true; \
		echo "$(YELLOW)  → Suppression des node_modules du frontend...$(RESET)"; \
		rm -rf frontend/srcs/node_modules 2>/dev/null || true; \
		echo "$(YELLOW)  → Suppression des node_modules du backend...$(RESET)"; \
		rm -rf backend/srcs/node_modules 2>/dev/null || true; \
		echo "$(YELLOW)  → Suppression du .env à la racine...$(RESET)"; \
		rm -f .env 2>/dev/null || true; \
		echo "$(YELLOW)  → Suppression du .env du backend...$(RESET)"; \
		rm -f backend/srcs/.env 2>/dev/null || true; \
		echo "$(GREEN)✅ Nettoyage total terminé !$(RESET)"; \
	else \
		echo "$(BLUE)ℹ️  Annulé.$(RESET)"; \
	fi

ps: status ## Alias pour status

status: ## Afficher le statut des conteneurs
	@echo "$(BLUE)📊 Statut des conteneurs:$(RESET)"
	@echo ""
	@echo "$(YELLOW)Mode Développement:$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml ps 2>/dev/null || echo "  Aucun conteneur en cours"
	@echo ""
	@echo "$(YELLOW)Mode Production:$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.prod.yml ps 2>/dev/null || echo "  Aucun conteneur en cours"

logs: ## Voir tous les logs (dev ou prod selon ce qui tourne)
	@if $(DOCKER_COMPOSE) -f docker-compose.dev.yml ps | grep -q "Up"; then \
		$(DOCKER_COMPOSE) -f docker-compose.dev.yml logs -f; \
	elif $(DOCKER_COMPOSE) -f docker-compose.prod.yml ps | grep -q "Up"; then \
		$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f; \
	else \
		echo "$(RED)❌ Aucun conteneur en cours d'exécution$(RESET)"; \
	fi

##@ Utilitaires

shell-backend: ## Ouvrir un shell dans le conteneur backend
	@if $(DOCKER_COMPOSE) -f docker-compose.dev.yml ps | grep -q "simulator_backend_dev"; then \
		$(DOCKER_COMPOSE) -f docker-compose.dev.yml exec backend sh; \
	elif $(DOCKER_COMPOSE) -f docker-compose.prod.yml ps | grep -q "simulator_backend_prod"; then \
		$(DOCKER_COMPOSE) -f docker-compose.prod.yml exec backend sh; \
	else \
		echo "$(RED)❌ Aucun conteneur backend en cours d'exécution$(RESET)"; \
	fi

shell-frontend: ## Ouvrir un shell dans le conteneur frontend (dev uniquement)
	@if $(DOCKER_COMPOSE) -f docker-compose.dev.yml ps | grep -q "simulator_frontend_dev"; then \
		$(DOCKER_COMPOSE) -f docker-compose.dev.yml exec frontend sh; \
	else \
		echo "$(RED)❌ Le conteneur frontend n'est disponible qu'en mode développement$(RESET)"; \
	fi

shell-nginx: ## Ouvrir un shell dans le conteneur nginx
	@if $(DOCKER_COMPOSE) -f docker-compose.dev.yml ps | grep -q "simulator_nginx_dev"; then \
		$(DOCKER_COMPOSE) -f docker-compose.dev.yml exec nginx sh; \
	elif $(DOCKER_COMPOSE) -f docker-compose.prod.yml ps | grep -q "simulator_nginx_prod"; then \
		$(DOCKER_COMPOSE) -f docker-compose.prod.yml exec nginx sh; \
	else \
		echo "$(RED)❌ Aucun conteneur nginx en cours d'exécution$(RESET)"; \
	fi

shell-db: ## Ouvrir un shell MySQL dans le conteneur MariaDB
	@if $(DOCKER_COMPOSE) -f docker-compose.dev.yml ps | grep -q "calculatorGCC_mariadb_dev"; then \
		$(DOCKER_COMPOSE) -f docker-compose.dev.yml exec mariadb mysql -u root -p; \
	elif $(DOCKER_COMPOSE) -f docker-compose.prod.yml ps | grep -q "calculatorGCC_mariadb_prod"; then \
		$(DOCKER_COMPOSE) -f docker-compose.prod.yml exec mariadb mysql -u root -p; \
	else \
		echo "$(RED)❌ Aucun conteneur MariaDB en cours d'exécution$(RESET)"; \
	fi

db-backup: ## Créer une sauvegarde de la base de données
	@echo "$(BLUE)💾 Création d'une sauvegarde de la base de données...$(RESET)"
	@mkdir -p ./backups
	@if $(DOCKER_COMPOSE) -f docker-compose.dev.yml ps | grep -q "calculatorGCC_mariadb_dev"; then \
		$(DOCKER_COMPOSE) -f docker-compose.dev.yml exec -T mariadb mysqldump -u root -p$$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f2) --all-databases > ./backups/backup_$$(date +%Y%m%d_%H%M%S).sql; \
	elif $(DOCKER_COMPOSE) -f docker-compose.prod.yml ps | grep -q "calculatorGCC_mariadb_prod"; then \
		$(DOCKER_COMPOSE) -f docker-compose.prod.yml exec -T mariadb mysqldump -u root -p$$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f2) --all-databases > ./backups/backup_$$(date +%Y%m%d_%H%M%S).sql; \
	else \
		echo "$(RED)❌ Aucun conteneur MariaDB en cours d'exécution$(RESET)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✅ Sauvegarde créée dans ./backups/$(RESET)"

db-show-password: ## Afficher les informations de connexion à la base de données
	@echo "$(BLUE)🔑 Informations de connexion à la base de données:$(RESET)"
	@echo ""
	@if [ -f .env ]; then \
		APP_DOMAIN=$$(grep "^APP_DOMAIN=" .env | cut -d '=' -f2); \
		APP_DOMAIN=$${APP_DOMAIN:-http://localhost:3000}; \
		echo "$(YELLOW)Root Password:$(RESET) $$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f2)"; \
		echo "$(YELLOW)Database:$(RESET) $$(grep DB_NAME .env | cut -d '=' -f2)"; \
		echo "$(YELLOW)User:$(RESET) $$(grep DB_USER .env | cut -d '=' -f2)"; \
		echo "$(YELLOW)User Password:$(RESET) $$(grep DB_PASSWORD .env | cut -d '=' -f2)"; \
		echo ""; \
		echo "$(GREEN)phpMyAdmin:$(RESET) $$APP_DOMAIN/phpmyadmin"; \
		echo "$(GREEN)MariaDB Host:$(RESET) mariadb (accessible uniquement depuis le réseau Docker)"; \
		echo "$(GREEN)MariaDB Port:$(RESET) 3306"; \
	else \
		echo "$(RED)❌ Fichier .env non trouvé$(RESET)"; \
	fi
	@echo ""

##@ Prisma

prisma-generate: ## Régénérer le client Prisma (après modif du schema)
	@echo "$(BLUE)⚙️  Génération du client Prisma...$(RESET)"
	@docker exec calculatorGCC_backend_dev npx prisma generate
	@echo "$(GREEN)✅ Client Prisma régénéré$(RESET)"
	@echo "$(YELLOW)⚠️  Redémarre le backend : make restart-backend$(RESET)"

prisma-push: ## Appliquer le schema Prisma à la DB (dev uniquement, sans migration)
	@echo "$(BLUE)📤 Application du schema Prisma...$(RESET)"
	@docker exec calculatorGCC_backend_dev npx prisma db push
	@echo "$(GREEN)✅ Schema appliqué$(RESET)"

prisma-migrate: ## Créer et appliquer une migration Prisma
	@printf "$(YELLOW)Nom de la migration : $(RESET)"; \
	read name; \
	docker exec -it calculatorGCC_backend_dev npx prisma migrate dev --name "$$name"

prisma-studio: ## Ouvrir Prisma Studio (interface DB graphique)
	@echo "$(BLUE)🔍 Ouverture de Prisma Studio sur http://localhost:5555 ...$(RESET)"
	@docker exec -it calculatorGCC_backend_dev npx prisma studio

restart-backend: ## Redémarrer uniquement le conteneur backend dev
	@echo "$(YELLOW)🔄 Redémarrage du backend...$(RESET)"
	@docker restart calculatorGCC_backend_dev
	@echo "$(GREEN)✅ Backend redémarré$(RESET)"

##@ Par défaut

.DEFAULT_GOAL := help
