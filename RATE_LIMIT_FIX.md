# Correction du Rate Limit API 42

## Problème
L'API 42 retournait des erreurs 429 (Too Many Requests) lors du chargement du Dashboard, car nous faisions trop de requêtes simultanées sans système de cache.

## Solution Implémentée

### 1. Système de Cache (5 minutes)
Nous avons ajouté un système de cache dans `api42.service.ts` qui stocke les données dans le localStorage avec un timestamp :

- **Cache des projets** : Liste complète des projets de l'utilisateur
- **Cache du cursus** : Informations de cursus (niveau, etc.)
- **Cache des événements** : Liste des événements auxquels l'utilisateur a participé
- **Cache global** : Données utilisateur complètes (combinaison des 3 ci-dessus)

**Durée de validité** : 5 minutes (configurable via `CACHE_DURATION`)

### 2. Retry avec Exponential Backoff
Si une requête reçoit un 429 (rate limit), le système :
- Attend un délai avant de réessayer
- Utilise un exponential backoff (1s, 2s, 4s)
- Réessaie jusqu'à 3 fois maximum

```typescript
const fetchWithRetry = async (url: string, accessToken: string, retries = 0): Promise<Response> => {
  const response = await fetch(url, { ... });

  if (response.status === 429 && retries < 3) {
    const waitTime = Math.pow(2, retries) * 1000; // 1s, 2s, 4s
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return fetchWithRetry(url, accessToken, retries + 1);
  }

  return response;
};
```

### 3. Bouton de Rafraîchissement
Un bouton de rafraîchissement a été ajouté dans le Dashboard qui :
- Vide le cache
- Recharge toutes les données depuis l'API
- Affiche une animation de rotation au survol

## Avantages

✅ **Moins de requêtes API** : Les données sont récupérées une seule fois puis mises en cache  
✅ **Chargement plus rapide** : Utilisation du cache pour les rechargements  
✅ **Gestion des erreurs** : Retry automatique en cas de rate limit  
✅ **Expérience utilisateur** : Possibilité de forcer un refresh manuel  

## Structure du Cache

```typescript
interface CachedData<T> {
  data: T;
  timestamp: number;
}

const CACHE_KEYS = {
  USER_DATA: 'cached_user_data',
  PROJECTS: 'cached_projects',
  CURSUS: 'cached_cursus',
  EVENTS: 'cached_events',
};
```

## Fonctions Disponibles

### `api42Service.clearCache()`
Vide tout le cache et force un rechargement complet des données.

### Utilisation dans le Dashboard
```typescript
// Chargement initial (utilise le cache si disponible)
await loadUserData();

// Forcer un refresh (vide le cache)
await loadUserData(true);
```

## Fichiers Modifiés

- `src/services/api42.service.ts` : Ajout du cache et retry logic
- `src/pages/Dashboard/Dashboard.tsx` : Bouton refresh et gestion du cache
- `src/pages/Dashboard/Dashboard.scss` : Styles pour le bouton refresh

## Notes

Le cache utilise le système de stockage chiffré existant (`storage.ts`) pour garantir la sécurité des données même en cache.

La durée de cache de 5 minutes est un bon compromis entre :
- Performance (éviter trop de requêtes)
- Fraîcheur des données (pas trop ancien)
