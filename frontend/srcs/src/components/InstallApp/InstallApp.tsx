import React, { useEffect, useRef, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { promptInstall } from '@/services/installPrompt';
import { simulationService } from '@/services/simulation.service';
import { useAuth } from '@/contexts/useAuth';
import './InstallApp.scss';

/**
 * Proposer d'installer CalculatorGCC comme une vraie application, sur
 * téléphone et tablette uniquement.
 * - `InstallAppButton` : bouton seul (page de connexion).
 * - `InstallBanner` : bandeau en haut de toutes les pages connectées, avec
 *   « Ne plus me le rappeler » enregistré côté serveur (tous les appareils).
 * Masqués dès que l'application tourne en mode installé.
 */

// Par COMPTE : sur un appareil partagé, le refus de A ne doit ni masquer le
// bandeau de B, ni être renvoyé au serveur au nom de B.
const dismissKey = (login: string) => `install_prompt_dismissed:${login}`;

function readLocalDismissed(login: string | undefined): boolean {
	if (!login) return false;
	try { return localStorage.getItem(dismissKey(login)) === '1'; } catch { return false; }
}
function writeLocalDismissed(login: string | undefined) {
	if (!login) return;
	try { localStorage.setItem(dismissKey(login), '1'); } catch { /* sans gravité */ }
}

// Le Header (donc le bandeau) est remonté à chaque page : on ne redemande l'avis
// du serveur qu'une fois par compte et par chargement de l'application.
const syncedLogins = new Set<string>();

/** Marche à suivre quand le navigateur n'ouvre pas lui-même l'installation (iOS, Firefox…). */
const InstallHelpDialog: React.FC<{ open: boolean; ios: boolean; onClose: () => void }> = ({ open, ios, onClose }) => {
	const ref = useRef<HTMLDialogElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		const dlg = ref.current;
		if (!dlg) return;
		if (open && !dlg.open) dlg.showModal();
		else if (!open && dlg.open) dlg.close();
	}, [open]);

	useEffect(() => {
		const dlg = ref.current;
		if (!dlg) return;
		const handle = () => onCloseRef.current();
		dlg.addEventListener('close', handle);
		return () => dlg.removeEventListener('close', handle);
	}, []);

	return (
		<dialog ref={ref} className="install-help" aria-labelledby="install-help-title" onClick={e => { if (e.target === ref.current) onClose(); }}>
			<div className="install-help__body">
				<div className="install-help__head">
					<h2 id="install-help-title">Installer CalculatorGCC</h2>
					<button type="button" className="install-help__close" onClick={onClose} aria-label="Fermer">
						<X size={18} aria-hidden="true" />
					</button>
				</div>
				{ios ? (
					<ol>
						<li>Ouvre cette page dans <strong>Safari</strong>.</li>
						<li>Touche le bouton <strong>Partager</strong> <Share size={16} aria-label="(icône Partager)" className="install-help__icon" />.</li>
						<li>Choisis <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</li>
					</ol>
				) : (
					<ol>
						<li>Ouvre le <strong>menu du navigateur</strong> (⋮ en haut à droite dans Chrome).</li>
						<li>Choisis <strong>Installer l'application</strong> (ou <strong>Ajouter à l'écran d'accueil</strong>).</li>
						<li>Confirme : l'application s'ouvre ensuite sans la barre du navigateur.</li>
					</ol>
				)}
				<p className="install-help__note">
					Si tu l'avais déjà ajoutée comme simple raccourci, supprime-le puis installe-la à nouveau.
				</p>
				<button type="button" className="install-btn" onClick={onClose}>J'ai compris</button>
			</div>
		</dialog>
	);
};

/** Ouvre la fenêtre native si possible, sinon la marche à suivre. */
function useInstallAction() {
	const install = useInstallPrompt();
	const [helpOpen, setHelpOpen] = useState(false);
	const onInstall = async () => {
		const result = await promptInstall();
		if (result === 'unavailable') setHelpOpen(true);
	};
	const help = <InstallHelpDialog open={helpOpen} ios={install.ios} onClose={() => setHelpOpen(false)} />;
	return { install, onInstall, help };
}

export const InstallAppButton: React.FC<{ className?: string }> = ({ className }) => {
	const { install, onInstall, help } = useInstallAction();
	if (!install.mobile || install.installed) return null;
	return (
		<>
			<button type="button" className={`install-btn${className ? ` ${className}` : ''}`} onClick={onInstall}>
				<Download size={18} aria-hidden="true" />
				Installer l'application
			</button>
			{help}
		</>
	);
};

export const InstallBanner: React.FC = () => {
	const { install, onInstall, help } = useInstallAction();
	const { user } = useAuth();
	const login = user?.login;
	const [dismissed, setDismissed] = useState(() => readLocalDismissed(login));
	// Tant que le serveur n'a pas répondu, on ne montre rien : sinon le bandeau
	// apparaissait une seconde chez qui l'avait refusé sur un autre appareil.
	const [serverChecked, setServerChecked] = useState(() => !!login && syncedLogins.has(login));
	const visible = install.mobile && !install.installed && !dismissed && !!login && serverChecked;

	// Le choix « Ne plus me le rappeler » vit côté serveur : il vaut sur tous les appareils.
	useEffect(() => {
		if (!login || !install.mobile || install.installed || syncedLogins.has(login)) return;
		let cancelled = false;
		simulationService.getInstallPromptDismissed().then(({ dismissed: serverDismissed }) => {
			syncedLogins.add(login);
			if (serverDismissed) {
				writeLocalDismissed(login);
				if (!cancelled) setDismissed(true);
			} else if (readLocalDismissed(login)) {
				// Choisi ici par CE compte mais jamais arrivé au serveur (hors ligne) : on le renvoie.
				simulationService.saveInstallPromptDismissed(true).catch(() => {});
			}
		}).catch(() => { /* hors ligne : le choix local suffit */ })
			.finally(() => { if (!cancelled) setServerChecked(true); });
		return () => { cancelled = true; };
	}, [login, install.mobile, install.installed]);

	const onDismiss = () => {
		writeLocalDismissed(login);
		setDismissed(true);
		simulationService.saveInstallPromptDismissed(true).catch(() => { /* renvoyé au prochain chargement */ });
	};

	if (!visible) return help;
	return (
		<>
			<div className="install-banner" role="region" aria-label="Installer l'application">
				<img src="/icons/icon-192.png" alt="" className="install-banner__icon" width={36} height={36} />
				<div className="install-banner__text">
					<strong>CalculatorGCC en application</strong>
					<span>Plein écran, sans la barre du navigateur.</span>
				</div>
				<div className="install-banner__actions">
					<button type="button" className="install-btn install-btn--small" onClick={onInstall}>
						<Download size={16} aria-hidden="true" />
						Installer l'application
					</button>
					<button type="button" className="install-banner__dismiss" onClick={onDismiss}>
						Ne plus me le rappeler
					</button>
				</div>
			</div>
			{help}
		</>
	);
};
