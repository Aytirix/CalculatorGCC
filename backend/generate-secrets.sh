#!/bin/bash

echo "🔐 Génération des secrets pour Calculator GCC Backend"
echo "======================================================"
echo ""

JWT_SECRET=$(openssl rand -base64 32)

echo "✅ Secrets générés avec succès !"
echo ""
echo "Copiez ces valeurs dans votre fichier .env :"
echo ""
echo "JWT_SECRET=$JWT_SECRET"
echo ""
echo "⚠️  IMPORTANT : Ne partagez jamais ces secrets !"
echo "   Ajoutez-les uniquement dans votre .env local (ignoré par git)"
