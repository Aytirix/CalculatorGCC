/**
 * Données d'un COMPTE gardées dans le navigateur (copies locales de la
 * simulation, du calendrier, caches de l'API 42, session admin).
 *
 * La déconnexion ne les efface pas — on les retrouve en se reconnectant, même
 * celles pas encore envoyées au serveur. Mais sur un navigateur partagé, le
 * compte suivant voyait (et pouvait renvoyer dans SA base) les données du
 * précédent. On retient donc à qui elles appartiennent : quand un AUTRE compte
 * ouvre une session, elles sont effacées avant que la moindre page les lise.
 * Tout ce qui compte est en base : le nouveau compte recharge les siennes.
 */

export const LOCAL_OWNER_KEY = 'gcc_local_owner';
const OWNER_KEY = LOCAL_OWNER_KEY;

export const ACCOUNT_DATA_KEYS = [
	// Simulateur (copies locales, la base fait foi)
	'simulated_projects',
	'simulated_sub_projects',
	'project_percentages',
	'project_notes',
	'custom_projects',
	'coalition_boosts',
	'api_exp_percentages',
	'professional_experiences',
	'professional_experiences_synced',
	// Calendrier
	'calendar_projects',
	'calendar_range',
	'calendar_alternance',
	'calendar_alternance_legend',
	'calendar_alternance_sync',
	// Caches de l'API 42 (services/api42.service.ts)
	'cached_user_data',
	'cached_projects',
	'cached_cursus',
	'cached_events',
	// Guide de découverte (renvoyé en base par le Dashboard) et filtres
	'gcc_tour_seen_v1',
	'gcc_tour_steps_seen',
	'my_projects_filters',
	// Session d'administration
	'gcc_admin_session',
] as const;

/**
 * À appeler quand une session s'ouvre, AVANT d'afficher les pages. Renvoie
 * true si les données d'un autre compte ont été effacées.
 *
 * Navigateur sans propriétaire connu (données d'avant ce mécanisme) : on les
 * attribue au compte qui se connecte, sans rien effacer — c'est presque
 * toujours le sien, et effacer ferait perdre des modifications pas encore
 * envoyées.
 */
export function claimLocalDataFor(login: string): boolean {
	if (!login) return false;
	try {
		const owner = localStorage.getItem(OWNER_KEY);
		if (owner === login) return false;
		const cleared = owner !== null;
		if (cleared) {
			for (const key of ACCOUNT_DATA_KEYS) localStorage.removeItem(key);
		}
		localStorage.setItem(OWNER_KEY, login);
		return cleared;
	} catch {
		return false; // stockage bloqué : rien n'y est lu non plus
	}
}
