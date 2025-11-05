#!/usr/bin/env python3
"""
Script pour récupérer tous les projets d'un étudiant depuis l'API 42.
"""

import requests
import json
import sys
from typing import List, Dict, Optional


class API42Client:
    """Client pour interagir avec l'API 42."""
    
    BASE_URL = "https://api.intra.42.fr/v2"
    
    def __init__(self, access_token: str):
        """
        Initialise le client API 42.
        
        Args:
            access_token: Token d'accès à l'API 42
        """
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}"
        }
    
    def get_user_projects(self, user_id: str, page: int = 1, page_size: int = 100) -> List[Dict]:
        """
        Récupère une page de projets pour un utilisateur.
        
        Args:
            user_id: ID ou login de l'utilisateur
            page: Numéro de page
            page_size: Nombre d'éléments par page (max 100)
            
        Returns:
            Liste des projets de la page
        """
        url = f"{self.BASE_URL}/users/{user_id}/projects_users"
        params = {
            "page[number]": page,
            "page[size]": min(page_size, 100)  # Max 100 par page
        }
        
        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Erreur lors de la requête: {e}", file=sys.stderr)
            if hasattr(e, 'response') and e.response is not None:
                print(f"   Status: {e.response.status_code}", file=sys.stderr)
                print(f"   Response: {e.response.text}", file=sys.stderr)
            return []
    
    def get_all_user_projects(self, user_id: str) -> List[Dict]:
        """
        Récupère TOUS les projets d'un utilisateur (avec pagination automatique).
        
        Args:
            user_id: ID ou login de l'utilisateur
            
        Returns:
            Liste complète de tous les projets
        """
        all_projects = []
        page = 1
        page_size = 100
        
        print(f"📥 Récupération des projets pour l'utilisateur {user_id}...")
        
        while True:
            print(f"   Page {page}...", end=" ", flush=True)
            projects = self.get_user_projects(user_id, page, page_size)
            
            if not projects:
                print("✓")
                break
            
            all_projects.extend(projects)
            print(f"✓ ({len(projects)} projets)")
            
            # Si on a moins de projets que la taille de page, c'est la dernière page
            if len(projects) < page_size:
                break
            
            page += 1
        
        print(f"✅ Total: {len(all_projects)} projets récupérés\n")
        return all_projects
    
    def get_user_info(self, user_id: str) -> Optional[Dict]:
        """
        Récupère les informations d'un utilisateur.
        
        Args:
            user_id: ID ou login de l'utilisateur
            
        Returns:
            Informations de l'utilisateur ou None en cas d'erreur
        """
        url = f"{self.BASE_URL}/users/{user_id}"
        
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Erreur lors de la récupération des infos utilisateur: {e}", file=sys.stderr)
            return None


def format_project(project: Dict) -> str:
    """
    Formate un projet pour l'affichage.
    
    Args:
        project: Dictionnaire du projet
        
    Returns:
        Chaîne formatée
    """
    name = project.get("project", {}).get("name", "N/A")
    status = project.get("status", "N/A")
    validated = project.get("validated?", project.get("validated", False))
    final_mark = project.get("final_mark")
    marked = project.get("marked", False)
    
    # Emoji selon le statut
    if validated:
        emoji = "✅"
    elif marked and not validated:
        emoji = "❌"
    elif status == "in_progress":
        emoji = "⏳"
    else:
        emoji = "⚪"
    
    # Construire la ligne
    line = f"{emoji} {name:<40}"
    
    if final_mark is not None:
        line += f" {final_mark:>3}/100"
    else:
        line += f" {'---':>7}"
    
    line += f"  [{status}]"
    
    return line


def save_projects_to_file(projects: List[Dict], filename: str):
    """
    Sauvegarde les projets dans un fichier JSON.
    
    Args:
        projects: Liste des projets
        filename: Nom du fichier de sortie
    """
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(projects, f, indent=2, ensure_ascii=False)
        print(f"💾 Projets sauvegardés dans: {filename}")
    except Exception as e:
        print(f"❌ Erreur lors de la sauvegarde: {e}", file=sys.stderr)


def main():
    """Fonction principale."""
    
    # Configuration
    ACCESS_TOKEN = "xxx"  # TODO: Remplacer par votre token
    STUDENT_ID = "129448"  # TODO: Remplacer par l'ID de l'étudiant (ou login)
    
    # Vérifier les arguments de ligne de commande
    if len(sys.argv) > 1:
        STUDENT_ID = sys.argv[1]
    
    if len(sys.argv) > 2:
        ACCESS_TOKEN = sys.argv[2]
    
    # Initialiser le client
    client = API42Client(ACCESS_TOKEN)
    
    # Récupérer les infos de l'utilisateur
    user_info = client.get_user_info(STUDENT_ID)
    if user_info:
        print(f"\n👤 Utilisateur: {user_info.get('login')} ({user_info.get('displayname', 'N/A')})")
        print(f"   Email: {user_info.get('email', 'N/A')}")
        print(f"   Campus: {user_info.get('campus', [{}])[0].get('name', 'N/A') if user_info.get('campus') else 'N/A'}")
        print()
    
    # Récupérer tous les projets
    projects = client.get_all_user_projects(STUDENT_ID)
    
    if not projects:
        print("⚠️  Aucun projet trouvé.")
        return
    
    # Afficher les projets
    print("=" * 80)
    print("PROJETS".center(80))
    print("=" * 80)
    print()
    
    # Grouper par statut
    validated = [p for p in projects if p.get("validated?", p.get("validated", False))]
    failed = [p for p in projects if p.get("marked", False) and not p.get("validated?", p.get("validated", False))]
    in_progress = [p for p in projects if p.get("status") == "in_progress"]
    others = [p for p in projects if p not in validated and p not in failed and p not in in_progress]
    
    # Afficher validés
    if validated:
        print(f"✅ VALIDÉS ({len(validated)}):")
        for project in validated:
            print(f"   {format_project(project)}")
        print()
    
    # Afficher échoués
    if failed:
        print(f"❌ ÉCHOUÉS ({len(failed)}):")
        for project in failed:
            print(f"   {format_project(project)}")
        print()
    
    # Afficher en cours
    if in_progress:
        print(f"⏳ EN COURS ({len(in_progress)}):")
        for project in in_progress:
            print(f"   {format_project(project)}")
        print()
    
    # Afficher autres
    if others:
        print(f"⚪ AUTRES ({len(others)}):")
        for project in others:
            print(f"   {format_project(project)}")
        print()
    
    # Statistiques
    print("=" * 80)
    print("STATISTIQUES".center(80))
    print("=" * 80)
    print(f"Total de projets: {len(projects)}")
    print(f"Validés: {len(validated)}")
    print(f"Échoués: {len(failed)}")
    print(f"En cours: {len(in_progress)}")
    print(f"Autres: {len(others)}")
    
    # Sauvegarder dans un fichier
    output_file = f"projects_{STUDENT_ID}.json"
    save_projects_to_file(projects, output_file)


if __name__ == "__main__":
    main()
