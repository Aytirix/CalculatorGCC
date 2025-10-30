# Structure des données - Calculator GCC

## Base de données SQLite

### Table `users`

Stocke les informations des utilisateurs 42.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id_42 INTEGER UNIQUE NOT NULL,    -- ID unique de l'utilisateur sur 42
  login TEXT NOT NULL,                    -- Login 42 (ex: "jdupont")
  email TEXT NOT NULL,                    -- Email
  image_url TEXT,                         -- URL de l'avatar
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les recherches
CREATE INDEX idx_users_user_id_42 ON users(user_id_42);
```

**Exemple de données :**
```json
{
  "id": 1,
  "user_id_42": 123456,
  "login": "jdupont",
  "email": "jdupont@student.42.fr",
  "image_url": "https://cdn.intra.42.fr/users/jdupont.jpg",
  "created_at": "2024-10-26T10:30:00Z",
  "updated_at": "2024-10-26T10:30:00Z"
}
```

### Table `user_projects`

Stocke les données de progression (chiffrées).

```sql
CREATE TABLE user_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,               -- Référence vers users.id
  project_data TEXT NOT NULL,             -- JSON chiffré (AES-256-GCM)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour optimiser les recherches
CREATE INDEX idx_user_projects_user_id ON user_projects(user_id);
```

**Exemple de données (AVANT chiffrement) :**
```json
{
  "id": 1,
  "user_id": 1,
  "project_data": "salt:iv:tag:encrypted_data_here",
  "created_at": "2024-10-26T10:35:00Z",
  "updated_at": "2024-10-26T10:45:00Z"
}
```

## Données utilisateur (déchiffrées)

Le champ `project_data` contient un JSON chiffré avec cette structure :

```typescript
interface ProjectData {
  // Projets 42
  projects: {
    [projectSlug: string]: {
      completed: boolean;
      note?: string;
      percentage?: number;
    };
  };
  
  // Projets personnalisés
  customProjects: Array<{
    id: string;
    name: string;
    xp: number;
    category?: string;
  }>;
  
  // Expérience professionnelle (en mois)
  professionalExp: number;
  
  // Nombre d'événements suivis
  eventsAttended?: number;
  
  // Métadonnées
  lastSync?: string;
  version?: string;
}
```

### Exemple complet

```json
{
  "projects": {
    "libft": {
      "completed": true,
      "note": "Premier projet validé ! Beaucoup appris sur les pointeurs.",
      "percentage": 125
    },
    "ft_printf": {
      "completed": true,
      "note": "Variadic functions maîtrisées",
      "percentage": 100
    },
    "get_next_line": {
      "completed": false,
      "note": "En cours de développement",
      "percentage": 50
    },
    "born2beroot": {
      "completed": true,
      "percentage": 100
    },
    "so_long": {
      "completed": true,
      "note": "Premier projet graphique !",
      "percentage": 110
    }
  },
  "customProjects": [
    {
      "id": "custom-1698345678",
      "name": "Portfolio Personnel",
      "xp": 500,
      "category": "web"
    },
    {
      "id": "custom-1698445678",
      "name": "Bot Discord",
      "xp": 300,
      "category": "programmation"
    }
  ],
  "professionalExp": 12,
  "eventsAttended": 8,
  "lastSync": "2024-10-26T10:45:00Z",
  "version": "1.0"
}
```

## Chiffrement

### Format du texte chiffré

```
salt:iv:tag:encrypted
```

- **salt** : 64 bytes (hex) - Unique par entrée, utilisé pour dériver la clé
- **iv** : 16 bytes (hex) - Initialization Vector pour AES-GCM
- **tag** : 16 bytes (hex) - Authentication tag (garantit l'intégrité)
- **encrypted** : Données chiffrées (hex)

### Algorithme

```
1. Générer un salt aléatoire (64 bytes)
2. Dériver une clé avec PBKDF2:
   - Password: DB_ENCRYPTION_KEY (depuis .env)
   - Salt: Le salt généré
   - Iterations: 100,000
   - Key length: 32 bytes (256 bits)
   - Hash: SHA-512

3. Générer un IV aléatoire (16 bytes)

4. Chiffrer avec AES-256-GCM:
   - Algorithm: aes-256-gcm
   - Key: Clé dérivée
   - IV: IV généré
   - Data: JSON.stringify(projectData)

5. Récupérer l'authentication tag

6. Format final: salt:iv:tag:encrypted
```

### Déchiffrement

```
1. Parser le texte: salt:iv:tag:encrypted
2. Dériver la clé avec le même salt
3. Déchiffrer avec AES-256-GCM
4. Vérifier l'authentication tag
5. Parse le JSON
```

## JWT (JSON Web Token)

### Structure du payload

```typescript
{
  id: number;          // ID en base de données (users.id)
  user_id_42: number;  // ID 42 de l'utilisateur
  login: string;       // Login 42
  iat: number;         // Timestamp de création
  exp: number;         // Timestamp d'expiration (iat + 7 jours)
}
```

### Exemple de JWT

```
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "id": 1,
  "user_id_42": 123456,
  "login": "jdupont",
  "iat": 1698345678,
  "exp": 1698950478
}

Signature:
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  JWT_SECRET
)
```

### Token complet
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcl9pZF80MiI6MTIzNDU2LCJsb2dpbiI6ImpkdXBvbnQiLCJpYXQiOjE2OTgzNDU2NzgsImV4cCI6MTY5ODk1MDQ3OH0.signature_here
```

## API Responses

### Success Response

```json
{
  "data": {
    "id": 1,
    "login": "jdupont",
    "email": "jdupont@student.42.fr",
    "image_url": "https://cdn.intra.42.fr/users/jdupont.jpg"
  }
}
```

### Error Response

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing token"
}
```

### Validation Error

```json
{
  "error": "Validation Error",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "login",
      "message": "String must contain at least 2 character(s)"
    }
  ]
}
```

## Tailles et limites

- **Taille max JSON project_data** : Illimitée (TEXT en SQLite)
- **Nombre de projets** : Illimité
- **Nombre de projets custom** : Illimité
- **Longueur notes** : Illimitée
- **Rate limit** : 100 requêtes/minute (configurable)
- **JWT expiration** : 7 jours (configurable)
- **PBKDF2 iterations** : 100,000 (bon équilibre sécurité/performance)

## Migrations futures

Si besoin d'ajouter des champs :

### Version 1.0 → 1.1 (exemple)

```sql
-- Ajouter un champ preferences
ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}';

-- Mettre à jour la version dans project_data
UPDATE user_projects 
SET project_data = json_set(project_data, '$.version', '1.1')
WHERE json_extract(project_data, '$.version') = '1.0';
```

## Backup et Restore

### Backup

```bash
# Copier le fichier DB
cp data.db backups/data-$(date +%Y%m%d-%H%M%S).db

# Ou export SQL
sqlite3 data.db .dump > backup.sql
```

### Restore

```bash
# Depuis fichier DB
cp backups/data-20241026.db data.db

# Depuis SQL
sqlite3 data.db < backup.sql
```

## Sécurité des données

1. ✅ **Chiffrement at rest** - Données chiffrées en DB
2. ✅ **Chiffrement in transit** - HTTPS en production
3. ✅ **Authentication** - JWT vérifié sur chaque requête
4. ✅ **Authorization** - Un user ne peut accéder qu'à ses données
5. ✅ **Integrity** - Authentication tag GCM
6. ✅ **Confidentiality** - Salt unique par entrée
7. ✅ **Availability** - Rate limiting anti-DoS

## RGPD Compliance

- ✅ **Droit à l'oubli** : `DELETE /api/user/account` supprime tout
- ✅ **Droit d'accès** : `GET /api/projects/data` exporte les données
- ✅ **Minimisation** : Stockage uniquement des données nécessaires
- ✅ **Transparence** : Documentation claire des données stockées
