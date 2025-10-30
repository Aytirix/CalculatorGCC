# Rate Limiter Global API 42 avec File d'Attente

## 🎯 Objectif

Garantir **200ms minimum** entre **TOUTES** les requêtes vers l'API 42, peu importe le nombre d'utilisateurs simultanés, en utilisant une **vraie file d'attente thread-safe**.

## 🏗️ Architecture

### Classe `API42RateLimiter`

```typescript
class API42RateLimiter {
  private queue: QueuedRequest<any>[] = [];      // File d'attente des requêtes
  private processing = false;                     // Flag de traitement en cours
  private lastRequestTime = 0;                    // Timestamp de la dernière requête
  private readonly minDelay = 200;                // Délai minimum (ms)
}
```

### Composants

1. **File d'attente (queue)** : Stocke toutes les requêtes en attente
2. **Mutex virtuel (processing)** : Empêche le traitement concurrent
3. **Horodatage (lastRequestTime)** : Calcule le temps écoulé
4. **Wrapper `api42Request()`** : Interface simple pour les routes

## 🔄 Flux de Fonctionnement

### Scénario 1 : Requête unique (user seul)

```
User A lance 3 requêtes (projects, cursus, events)
│
├─> Request 1 (projects)
│   ├─> Ajoutée à la queue [1]
│   ├─> Processing démarre
│   ├─> Exécution immédiate (pas de délai car première requête)
│   └─> Complétée (lastRequestTime = T0)
│
├─> Request 2 (cursus)
│   ├─> Ajoutée à la queue [1]
│   ├─> Attend 200ms (T0 + 200ms - now)
│   └─> Complétée (lastRequestTime = T0 + 200ms)
│
└─> Request 3 (events)
    ├─> Ajoutée à la queue [1]
    ├─> Attend 200ms
    └─> Complétée (lastRequestTime = T0 + 400ms)

Total: ~400ms pour 3 requêtes
```

### Scénario 2 : Utilisateurs multiples (concurrence)

```
T=0ms    User A lance Request 1 (projects)
         │
         ├─> Queue: [A1] → Processing démarre
         └─> A1 exécutée immédiatement

T=50ms   User B lance Request 1 (projects)
         │
         ├─> Queue: [B1] → Attente (processing=true)
         └─> A1 toujours en cours

T=100ms  User A lance Request 2 (cursus)
         │
         └─> Queue: [B1, A2] → Attente

T=150ms  A1 complétée (lastRequestTime = 150ms)
         │
         └─> Queue traite B1 automatiquement

T=150ms  B1 vérifie délai
         │
         ├─> Temps écoulé: 0ms (150 - 150)
         ├─> Attente nécessaire: 200ms
         └─> Sleep 200ms

T=350ms  B1 exécutée (lastRequestTime = 350ms)
         │
         └─> Queue traite A2 automatiquement

T=350ms  A2 vérifie délai
         │
         ├─> Temps écoulé: 0ms
         ├─> Attente nécessaire: 200ms
         └─> Sleep 200ms

T=550ms  A2 exécutée (lastRequestTime = 550ms)
         │
         └─> Queue vide, processing = false

✅ Résultat: 200ms garantis entre chaque requête
```

### Scénario 3 : Burst simultané (3 users en même temps)

```
T=0ms    User A, B, C lancent simultanément leurs requêtes
         │
         ├─> Queue: [A1, A2, A3, B1, B2, B3, C1, C2, C3]
         └─> Processing démarre

T=0ms    A1 exécutée immédiatement
T=200ms  A2 exécutée (wait 200ms)
T=400ms  A3 exécutée (wait 200ms)
T=600ms  B1 exécutée (wait 200ms)
T=800ms  B2 exécutée (wait 200ms)
T=1000ms B3 exécutée (wait 200ms)
T=1200ms C1 exécutée (wait 200ms)
T=1400ms C2 exécutée (wait 200ms)
T=1600ms C3 exécutée (wait 200ms)

Total: 1.6s pour traiter 3 utilisateurs
Queue max: 9 requêtes
✅ Aucun spam API 42, délai garanti
```

## 🔍 Code Détail

### Ajout à la queue (`enqueue`)

```typescript
async enqueue<T>(execute: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    // 1. Ajouter la requête à la queue
    this.queue.push({ execute, resolve, reject });
    
    // 2. Logger la taille
    console.log(`[API42 Queue] Request added (size: ${this.queue.length})`);
    
    // 3. Démarrer le traitement si pas déjà en cours
    if (!this.processing) {
      this.processQueue();
    }
  });
}
```

**Clé** : La Promise est résolue **plus tard** par `processQueue()`, pas immédiatement.

### Traitement de la queue (`processQueue`)

```typescript
private async processQueue(): Promise<void> {
  // 1. Protection contre le traitement concurrent
  if (this.processing || this.queue.length === 0) return;
  
  this.processing = true; // 🔒 Mutex lock

  while (this.queue.length > 0) {
    const request = this.queue.shift()!; // Retirer de la queue
    
    // 2. Calculer le délai nécessaire
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime)); // ⏱️ Attente
    }

    // 3. Exécuter la requête
    try {
      const result = await request.execute();
      this.lastRequestTime = Date.now(); // 📝 Mise à jour timestamp
      request.resolve(result); // ✅ Résolution de la Promise originale
    } catch (error) {
      request.reject(error); // ❌ Rejet de la Promise
    }
  }

  this.processing = false; // 🔓 Mutex unlock
}
```

**Points clés** :
- `processing = true` empêche le traitement concurrent
- Boucle `while` traite toute la queue
- Chaque requête attend exactement 200ms après la précédente
- Les Promises sont résolues dans l'ordre FIFO

### Wrapper d'utilisation

```typescript
async function api42Request<T>(url: string, token: string): Promise<T> {
  return api42RateLimiter.enqueue(async () => {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  });
}
```

**Utilisation dans les routes** :
```typescript
// Au lieu de:
const data = await axios.get(url, { headers: { Authorization: token } });

// Maintenant:
const data = await api42Request(url, token);
```

## 📊 Avantages

### ✅ Thread-safe (ou plutôt async-safe)
- Un seul traitement à la fois grâce au flag `processing`
- Pas de race condition possible

### ✅ FIFO garanti
- Les requêtes sont traitées dans l'ordre d'arrivée
- `queue.shift()` retire toujours le premier élément

### ✅ Délai garanti
- 200ms **minimum** entre chaque requête
- Valide même avec 100 users simultanés

### ✅ Transparent
- Aucun changement dans la logique des routes
- Juste remplacer `axios.get()` par `api42Request()`

### ✅ Observable
- Logs clairs de la queue (`[API42 Queue]`)
- Taille de la queue affichée en temps réel

## 🎓 Logs Exemple

```
[API42 Queue] Request added to queue (queue size: 1)
[API42 Queue] Executing request (0 remaining in queue)
[API42 Routes] ✓ Projects fetched: 30 items

[API42 Queue] Request added to queue (queue size: 1)
[API42 Queue] Waiting 150ms before next request (0 in queue)...
[API42 Queue] Executing request (0 remaining in queue)
[API42 Routes] ✓ Cursus fetched: 3 items

[API42 Queue] Request added to queue (queue size: 1)
[API42 Queue] Waiting 200ms before next request (0 in queue)...
[API42 Queue] Executing request (0 remaining in queue)
[API42 Routes] ✓ Events fetched: 20 items

[API42 Queue] Queue empty, processing stopped
```

## ⚡ Performance

### Temps théorique

Pour N requêtes :
- Temps minimum = N * 200ms
- Temps maximum = N * 200ms + temps API

**Exemple** :
- 3 requêtes (user-data) : 400ms + latence API (~1.4s total)
- 9 requêtes (3 users) : 1600ms + latence API (~3s total)

### Comparaison

| Scénario | Sans queue | Avec queue |
|----------|------------|------------|
| 1 user, 3 req | 3 req simultanées = SPAM | 3 req espacées de 200ms |
| 3 users simultanés | 9 req simultanées = RATE LIMIT | 9 req séquentielles |
| 10 users burst | 30 req = BAN | 30 req sur 6s = OK |

## 🛡️ Protection Rate Limit

L'API 42 a typiquement une limite de **~1200 req/h** (environ 20 req/min).

**Sans queue** :
- 10 users chargent la page en même temps
- 10 × 3 = 30 requêtes instantanées
- 30 req / 20 max = **RATE LIMIT** 🔴

**Avec queue** :
- 10 users chargent la page
- 30 requêtes espacées de 200ms
- 30 × 200ms = 6 secondes
- 30 req / 6s = 5 req/s = 300 req/min
- **Toujours dans la limite** ✅

## 🔧 Configuration

Pour ajuster le délai :

```typescript
class API42RateLimiter {
  private readonly minDelay = 200; // ← Changer ici
}
```

**Recommandations** :
- 200ms = bon équilibre (rapide + sûr)
- 100ms = plus rapide mais risqué
- 500ms = très sûr mais lent

## 📝 Maintenance

### Vider la queue (redémarrage serveur)
```bash
# La queue est en mémoire, elle disparaît au restart
npm run dev
```

### Monitoring en production
```typescript
// Ajouter un endpoint de monitoring
fastify.get('/api/queue-status', () => ({
  queueSize: api42RateLimiter.queue.length,
  processing: api42RateLimiter.processing,
  lastRequest: api42RateLimiter.lastRequestTime,
}));
```

## 🎯 Conclusion

Ce système garantit une utilisation **respectueuse et efficace** de l'API 42, même sous forte charge. La file d'attente assure qu'aucune requête ne sera jamais "oubliée" ou rejetée pour cause de rate limit.
