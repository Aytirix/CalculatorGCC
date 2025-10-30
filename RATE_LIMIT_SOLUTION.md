# ⚠️ Rate Limit API 42 - Solution

## Problème

L'API 42 a une limite de taux (rate limit) : **429 Too Many Requests (Spam Rate Limit Exceeded)**

Cela arrive quand on fait trop de requêtes en peu de temps pendant les tests.

## ✅ Solution implémentée

### Cache côté backend (5 minutes)

Un cache en mémoire a été ajouté côté backend pour éviter de requêter l'API 42 trop souvent.

**Avantages** :
- Les données sont mises en cache pendant 5 minutes
- Les rechargements de page utilisent le cache (pas de nouvelle requête API 42)
- Évite le rate limiting pendant le développement
- Performance améliorée

**Comment ça marche** :
```
Première requête → API 42 → Cache (5 min) → Frontend
Requêtes suivantes (< 5 min) → Cache → Frontend ✅ (pas de requête API 42)
Après 5 minutes → API 42 → Cache actualisé → Frontend
```

### Force refresh disponible

Le bouton "Rafraîchir" dans le Dashboard bypass le cache et fait une vraie requête à l'API 42.

```typescript
// Sans cache
BackendAPI42Service.getUserData(true);

// Avec cache (défaut)
BackendAPI42Service.getUserData();
```

## 🕐 Que faire maintenant ?

### Option 1 : Attendre (2-5 minutes)
Le rate limit de l'API 42 se réinitialise automatiquement après quelques minutes.

1. Attendez 2-5 minutes
2. Redémarrez le backend (pour charger le cache)
3. Rechargez la page

### Option 2 : Utiliser le cache
1. Redémarrez le backend
2. Reconnectez-vous UNE FOIS
3. Les rechargements suivants utiliseront le cache

### Option 3 : Vider le cache manuel
Si vous voulez forcer une requête fraîche :
1. Cliquez sur le bouton "⟳" (rafraîchir) dans le Dashboard
2. Cela bypass le cache et fait une vraie requête

## 📊 Logs du cache

Quand vous utilisez le cache, vous verrez dans les logs backend :
```
[Cache] Hit for key: user-data-178971 (age: 45s)
[API42 Routes] Returning cached data
```

Quand le cache expire ou est bypassé :
```
[API42 Routes] Making parallel requests to API 42...
[API42 Routes] API 42 requests successful
[Cache] Set for key: user-data-178971
```

## ⚙️ Configuration

Le cache est défini dans `backend/src/routes/api42.routes.ts` :

```typescript
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

Vous pouvez ajuster cette durée selon vos besoins :
- **1 minute** : `1 * 60 * 1000`
- **10 minutes** : `10 * 60 * 1000`
- **30 minutes** : `30 * 60 * 1000`

## 🎯 Tester maintenant

1. **Attendez 3-5 minutes** (pour que le rate limit de l'API 42 se réinitialise)
2. **Redémarrez le backend** :
   ```bash
   cd backend
   npm run dev
   ```
3. **Rechargez le frontend** (Ctrl+R)
4. **Reconnectez-vous**

Cette fois, après la première connexion réussie, tous les rechargements utiliseront le cache et ne déclencheront PAS de nouvelles requêtes vers l'API 42 ! ✅

## 📝 Note

Le cache est en **mémoire** (RAM), donc :
- ✅ Très rapide
- ✅ Simple
- ❌ Perdu au redémarrage du serveur
- ❌ Partagé entre tous les utilisateurs

Pour une vraie production, vous pourriez utiliser Redis ou un autre cache persistant.

---

**Attendez quelques minutes et réessayez !** ⏱️
