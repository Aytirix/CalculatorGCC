/**
 * Liste d'utilisateurs pour le sélecteur dev (mode développement uniquement)
 * Ajouter ici les logins et IDs 42 pour tester différents profils
 */
export interface DevUser {
	login: string;
	id: number;
}

export const DEV_USERS: DevUser[] = [
	// Ajouter les utilisateurs de test ici :
	{ login: 'sspina', id: 97753 },
	{ login: 'thibnguy', id: 117570 },
	{ login: 'mberger', id: 92546 },
];

export const isDev = import.meta.env.DEV;
