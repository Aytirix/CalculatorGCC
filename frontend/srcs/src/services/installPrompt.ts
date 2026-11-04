/**
 * Installation de l'application (PWA).
 *
 * - Chrome / Edge / Android : le navigateur émet `beforeinstallprompt` quand
 *   l'appli est installable ; on garde l'événement pour déclencher la VRAIE
 *   fenêtre d'installation au clic sur notre bouton.
 * - Safari iOS : pas d'événement — on ne peut qu'expliquer la marche à suivre
 *   (Partager → Sur l'écran d'accueil).
 * - Déjà installée (lancée en mode `standalone`) : on ne propose plus rien.
 *
 * L'écoute doit commencer TÔT (main.tsx) : l'événement part une seule fois,
 * souvent avant que React ait monté le bouton.
 */

export interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
	/** La fenêtre d'installation native peut être ouverte. */
	canPrompt: boolean;
	/** L'appli tourne déjà en mode installé, ou vient d'être installée. */
	installed: boolean;
	/** Téléphone ou tablette (là où l'on propose l'installation). */
	mobile: boolean;
	/** iPhone / iPad : installation manuelle uniquement. */
	ios: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
let state: InstallState = { canPrompt: false, installed: false, mobile: false, ios: false };
const listeners = new Set<() => void>();

function computeState(): InstallState {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return { canPrompt: false, installed: false, mobile: false, ios: false };
	}
	const ua = navigator.userAgent || '';
	// iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile.
	const ipadOs = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
	const ios = /iPhone|iPad|iPod/.test(ua) || ipadOs;
	const mobile = ios || /Android|Mobile|Tablet|Silk|Kindle/i.test(ua);
	const standalone = (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
		|| (navigator as Navigator & { standalone?: boolean }).standalone === true;
	return { canPrompt: !!deferred, installed: standalone || justInstalled, mobile, ios };
}

function emit() {
	state = computeState();
	listeners.forEach(l => l());
}

let started = false;

/** À appeler une fois, au démarrage (main.tsx). */
export function initInstallPrompt(): void {
	if (started || typeof window === 'undefined') return;
	started = true;
	window.addEventListener('beforeinstallprompt', (e) => {
		// Empêche la mini-barre automatique de Chrome : c'est notre bouton qui la propose.
		e.preventDefault();
		deferred = e as BeforeInstallPromptEvent;
		emit();
	});
	window.addEventListener('appinstalled', () => {
		justInstalled = true;
		deferred = null;
		emit();
	});
	window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
	emit();
}

export function subscribeInstall(listener: () => void): () => void {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

export function getInstallState(): InstallState {
	return state;
}

/**
 * Ouvre la fenêtre d'installation native. 'unavailable' : le navigateur ne la
 * propose pas (iOS, Firefox, déjà refusée) — afficher la marche à suivre.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	const event = deferred;
	if (!event) return 'unavailable';
	deferred = null; // un événement ne sert qu'une fois
	emit();
	try {
		await event.prompt();
		const { outcome } = await event.userChoice;
		if (outcome === 'accepted') { justInstalled = true; emit(); }
		return outcome;
	} catch {
		return 'unavailable';
	}
}

/** Enregistre le service worker (installabilité + page hors connexion). */
export function registerServiceWorker(): void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch(() => { /* non bloquant */ });
	});
}
