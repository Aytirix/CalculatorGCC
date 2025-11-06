# Exemple de configuration pour la connexion à la base de données depuis le backend

## Variables d'environnement à ajouter dans backend/srcs/.env

```bash
# Configuration Base de données MariaDB
DB_HOST=mariadb
DB_PORT=3306
DB_NAME=calculatorgcc
DB_USER=calculatorgcc_user
DB_PASSWORD=<sera_copié_depuis_.env_racine>
```

## Exemple avec TypeORM (Node.js/TypeScript)

### Installation
```bash
npm install typeorm mysql2 reflect-metadata
```

### Configuration (ormconfig.ts)
```typescript
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'mariadb',
  host: process.env.DB_HOST || 'mariadb',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'calculatorgcc_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'calculatorgcc',
  synchronize: process.env.NODE_ENV === 'development', // Ne PAS utiliser en production
  logging: process.env.NODE_ENV === 'development',
  entities: ['src/entities/**/*.ts'],
  migrations: ['src/migrations/**/*.ts'],
});
```

## Exemple avec Prisma

### Installation
```bash
npm install prisma @prisma/client
npx prisma init
```

### Configuration (prisma/schema.prisma)
```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

### Variable d'environnement
```bash
DATABASE_URL="mysql://calculatorgcc_user:PASSWORD@mariadb:3306/calculatorgcc"
```

## Exemple avec Sequelize

### Installation
```bash
npm install sequelize mysql2
```

### Configuration
```typescript
import { Sequelize } from 'sequelize';

const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || 'mariadb',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'calculatorgcc_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'calculatorgcc',
  logging: process.env.NODE_ENV === 'development',
});

export default sequelize;
```

## Test de connexion simple

```typescript
import mysql from 'mysql2/promise';

async function testConnection() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'mariadb',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'calculatorgcc_user',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'calculatorgcc',
    });

    console.log('✅ Connexion à la base de données réussie');
    
    const [rows] = await connection.execute('SELECT 1 + 1 AS result');
    console.log('Test query result:', rows);
    
    await connection.end();
  } catch (error) {
    console.error('❌ Erreur de connexion à la base de données:', error);
  }
}
```

## Script pour copier les variables d'environnement

Créer un script `scripts/sync-db-env.sh`:
```bash
#!/bin/bash

# Copier les variables DB du .env racine vers backend/srcs/.env

ROOT_ENV=".env"
BACKEND_ENV="backend/srcs/.env"

if [ ! -f "$ROOT_ENV" ]; then
    echo "❌ Fichier $ROOT_ENV non trouvé"
    exit 1
fi

# Extraire les variables DB
DB_PASSWORD=$(grep DB_PASSWORD "$ROOT_ENV" | cut -d '=' -f2)
DB_NAME=$(grep DB_NAME "$ROOT_ENV" | cut -d '=' -f2)
DB_USER=$(grep DB_USER "$ROOT_ENV" | cut -d '=' -f2)

# Ajouter ou mettre à jour dans backend/.env
echo "# Configuration Base de données (auto-généré)" >> "$BACKEND_ENV"
echo "DB_HOST=mariadb" >> "$BACKEND_ENV"
echo "DB_PORT=3306" >> "$BACKEND_ENV"
echo "DB_NAME=$DB_NAME" >> "$BACKEND_ENV"
echo "DB_USER=$DB_USER" >> "$BACKEND_ENV"
echo "DB_PASSWORD=$DB_PASSWORD" >> "$BACKEND_ENV"

echo "✅ Variables DB copiées vers $BACKEND_ENV"
```
