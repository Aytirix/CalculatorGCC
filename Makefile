.PHONY: help dev prod stop clean logs logs-dev logs-prod restart-dev restart-prod build-dev build-prod ps status

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
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)📝 Création du fichier .env depuis .env.example...$(RESET)"; \
		cp .env.example .env; \
		echo "$(GREEN)✅ Fichier .env créé !$(RESET)"; \
	fi
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml up --build -d
	@echo ""
	@echo "$(GREEN)✅ Application démarrée !$(RESET)"
	@echo ""
	@bash ./scripts/show-urls.sh || true
	@echo ""

build-dev: ## Rebuild les images en mode développement
	@echo "$(GREEN)🔨 Reconstruction des images de développement...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml build --no-cache

restart-dev: ## Redémarrer les services en mode développement
	@echo "$(YELLOW)🔄 Redémarrage des services de développement...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml restart
	@echo "$(GREEN)✅ Services redémarrés !$(RESET)"

logs-dev: ## Voir les logs en mode développement
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml logs -f

##@ Production

prod: ## Démarrer l'application en mode production
	@echo "$(GREEN)🚀 Démarrage en mode PRODUCTION...$(RESET)"
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)📝 Création du fichier .env depuis .env.example...$(RESET)"; \
		cp .env.example .env; \
		echo "$(GREEN)✅ Fichier .env créé !$(RESET)"; \
	fi
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
	echo "$(YELLOW)  → Suppression des node_modules du frontend...$(RESET)"; \
	rm -rf frontend/srcs/node_modules 2>/dev/null || true; \
	echo "$(YELLOW)  → Suppression des node_modules du backend...$(RESET)"; \
	rm -rf backend/srcs/node_modules 2>/dev/null || true; \

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

##@ Par défaut

.DEFAULT_GOAL := help
