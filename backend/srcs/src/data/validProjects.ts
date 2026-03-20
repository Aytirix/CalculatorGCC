/**
 * Liste de tous les project IDs et sub-project IDs valides
 * Extraite des fichiers rncp*_database*.ts du frontend
 * Utilisée pour valider les données envoyées par le client
 */

export const VALID_PROJECT_IDS = new Set([
	// === RNCP Global / Web / Mobile ===
	'camagru', 'darkly', 'h42n42', 'hypertube', 'matcha', 'music-room',
	'red-tetris', 'tokenize-art', 'tokenizer',
	'piscine-ror', 'piscine-django', 'piscine-symfony',
	'ft-hangouts', 'peace-break', 'swifty-companion', 'swifty-proteins', 'piscine-mobile',

	// === RNCP 6 Applicatif ===
	'avaj-launcher', 'fix-me', 'swingy', 'piscine-object',

	// === RNCP 7 System & Network ===
	'ft-linux', 'ft-script', 'ft-select', 'lem-ipc', 'libasm',
	'little-penguin-1', 'malloc', 'nm', 'strace',
	'accessible-directory', 'active-discovery', 'ft-ping', 'ft-traceroute',
	'active-connect', 'active-tech-tales', 'cybersecurity-vaccine-web',
	'ft-malcolm', 'micro-forensx', 'unleash-the-box',
	'boot2root', 'cloud-1', 'death', 'famine', 'ft-nmap', 'ft-shield',
	'matt-daemon', 'override', 'pestilence', 'rainfall', 'snow-crash',
	'taskmaster', 'tinky-winkey', 'war', 'woody-woodpacker',

	// === RNCP 7 Database & Data ===
	'piscine-data-science', 'python-for-data-science',
	'ft-linear-regression', 'learn2slither', 'matrix',
	'multilayer-perceptron', 'ready-set-boole',
	'dslr', 'expert-system', 'gomoku', 'krpsim', 'leaffliction',
	'n-puzzle', 'total-perspective-vortex',

	// === RNCP Global group projects ===
	'42sh', 'administrative-directory', 'automatic-directory',
	'bgp-at-doors', 'bomberman', 'corewar', 'doom-nukem',
	'filesystem', 'freddie-mercury', 'ft-ality', 'ft-kalman',
	'ft-minecraft', 'ft-newton', 'ft-turing', 'ft-vox',
	'gbmu', 'guimp', 'humangl',
	'inception-of-things', 'kfs-1', 'kfs-2', 'kfs-3', 'kfs-4',
	'kfs-5', 'kfs-6', 'kfs-7', 'kfs-8', 'kfs-9', 'kfs-x',
	'lem-in', 'mod1', 'nibbler', 'open-project',
	'rt', 'rubik', 'shaderpixel',
	'userspace-digressions', 'xv', 'zappy',
]);

export const VALID_SUB_PROJECT_IDS = new Set([
	// Piscine RoR
	'ror-0-starting', 'ror-0-initiation', 'ror-0-oob',
	'ror-1-base-rails', 'ror-1-gems',
	'ror-2-sql',
	'ror-3-sessions', 'ror-3-advanced', 'ror-3-final',

	// Piscine Django
	'django-0-starting', 'django-0-initiation', 'django-0-oob',
	'django-1-lib', 'django-1-base',
	'django-2-sql',
	'django-3-sessions', 'django-3-advanced', 'django-3-final',

	// Piscine Symfony
	'symfony-0-starting', 'symfony-0-initiation', 'symfony-0-oob',
	'symfony-1-base', 'symfony-1-composer',
	'symfony-2-sql',
	'symfony-3-sessions', 'symfony-3-advanced', 'symfony-3-final',

	// Piscine Data Science
	'data-science-0', 'data-science-1', 'data-science-2',
	'data-science-3', 'data-science-4',

	// Python for Data Science
	'python-0-starting', 'python-1-array', 'python-2-datatable',
	'python-3-oop', 'python-4-dod',

	// Piscine Mobile
	'mobile-0', 'mobile-1', 'mobile-2', 'mobile-3', 'mobile-4', 'mobile-5',

	// Piscine Object
	'object-module-00', 'object-module-01', 'object-module-02',
	'object-module-03', 'object-module-04', 'object-module-05',
]);

/**
 * Vérifie si un project ID est valide (projet principal ou custom)
 */
export const isValidProjectId = (id: string): boolean => {
	return VALID_PROJECT_IDS.has(id) || id.startsWith('custom-');
};

/**
 * Vérifie si un sub-project ID est valide
 */
export const isValidSubProjectId = (id: string): boolean => {
	return VALID_SUB_PROJECT_IDS.has(id);
};
