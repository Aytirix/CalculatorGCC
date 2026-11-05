import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash2, Upload } from 'lucide-react';
import {
	formatDateKey, formatShortYear, parseDateKey, plural, validateDateRange,
	type DateRange,
} from './calendarModel';
import './SettingsDialog.scss';

/**
 * Réglages du calendrier (roue dentée en haut de page) : la période affichée
 * et le planning d'alternance.
 *
 * Même fenêtre que le reste de l'app (fond sombre flouté `.modal-overlay`,
 * carte avec en-tête / corps / pied, animation framer-motion — voir
 * AddCustomProjectModal, ProjectPercentageModal) au lieu d'un <dialog> natif
 * stylé à part. Rendue dans <body> (portail) : les styles de la page
 * Calendrier ne la touchent pas. Le formulaire est RECRÉÉ à chaque ouverture
 * (`sessionKey`) : une saisie abandonnée ne réapparaît jamais ensuite.
 */

export type ImportResult =
	| { ok: true; days: number; contract: DateRange | null }
	| { ok: false; error: string };

interface SettingsFormProps {
	titleId: string;
	onClose: () => void;
	dateRange: DateRange;
	onSaveRange: (range: DateRange) => void;
	alternanceDayCount: number;
	onImport: (file: File) => Promise<ImportResult>;
	/** Efface le planning et renvoie de quoi l'annuler. */
	onClearAlternance: () => () => void;
}

interface SettingsDialogProps extends Omit<SettingsFormProps, 'titleId'> {
	open: boolean;
	sessionKey: number;
}

const SettingsForm: React.FC<SettingsFormProps> = ({
	titleId, onClose, dateRange, onSaveRange, alternanceDayCount, onImport, onClearAlternance,
}) => {
	const fileRef = useRef<HTMLInputElement>(null);
	const mountedRef = useRef(true);
	const [start, setStart] = useState(() => formatDateKey(dateRange.start));
	const [end, setEnd] = useState(() => formatDateKey(dateRange.end));
	const [importing, setImporting] = useState(false);
	const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
	const [contract, setContract] = useState<DateRange | null>(null);
	const [restoreCleared, setRestoreCleared] = useState<(() => void) | null>(null);

	useEffect(() => {
		mountedRef.current = true;
		return () => { mountedRef.current = false; };
	}, []);

	const s = parseDateKey(start);
	const e = parseDateKey(end);
	const rangeError = validateDateRange(s, e);
	const rangeChanged = !rangeError
		&& (start !== formatDateKey(dateRange.start) || end !== formatDateKey(dateRange.end));

	const handleSave = (ev: React.SyntheticEvent<HTMLFormElement>) => {
		ev.preventDefault();
		if (rangeError) return;
		if (rangeChanged) onSaveRange({ start: s, end: e });
		onClose();
	};

	const handleFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
		const file = ev.target.files?.[0];
		ev.target.value = '';
		if (!file) return;
		setImporting(true);
		setImportMsg(null);
		setContract(null);
		const res = await onImport(file);
		if (!mountedRef.current) return; // fenêtre fermée pendant la lecture
		setImporting(false);
		if (!res.ok) {
			setImportMsg({ kind: 'error', text: res.error });
			return;
		}
		setImportMsg({ kind: 'ok', text: `Planning importé : ${plural(res.days, 'jour')}.` });
		if (res.contract
			&& (formatDateKey(res.contract.start) !== start || formatDateKey(res.contract.end) !== end)) {
			setContract(res.contract);
		}
	};

	// Appliqué tout de suite : l'import l'est déjà, et fermer la fenêtre ne doit
	// pas perdre ces dates.
	const applyContractDates = () => {
		if (!contract || validateDateRange(contract.start, contract.end) !== null) return;
		onSaveRange(contract);
		setStart(formatDateKey(contract.start));
		setEnd(formatDateKey(contract.end));
		setContract(null);
		setImportMsg({ kind: 'ok', text: 'Période adaptée aux dates du contrat.' });
	};

	return (
		<form onSubmit={handleSave} noValidate>
			<div className="modal-header">
				<h3 id={titleId}>Réglages du calendrier</h3>
				<button type="button" className="close-button" onClick={onClose} aria-label="Fermer les réglages">✕</button>
			</div>

			<div className="modal-body">
				<section className="form-group" aria-labelledby={`${titleId}-range`}>
					<h4 id={`${titleId}-range`}>Période affichée</h4>
					<p className="field-hint">En général, la durée de ton contrat d'alternance.</p>
					<div className="cal-settings-dates">
						<label>
							<span>Du</span>
							<input type="date" className="text-input" value={start} onChange={ev => setStart(ev.target.value)} />
						</label>
						<label>
							<span>Au</span>
							<input type="date" className="text-input" value={end} onChange={ev => setEnd(ev.target.value)} min={start || undefined} />
						</label>
					</div>
					{rangeError && <p className="cal-settings-error" role="alert">{rangeError}</p>}
				</section>

				<section className="form-group" aria-labelledby={`${titleId}-alt`}>
					<h4 id={`${titleId}-alt`}>Planning d'alternance</h4>
					<p className="field-hint">
						{alternanceDayCount > 0
							? `Importé : ${plural(alternanceDayCount, 'jour')} coloré${alternanceDayCount > 1 ? 's' : ''} (école, entreprise, distanciel). Un nouvel import s'applique tout de suite.`
							: 'Importe le fichier .xlsx de ton école pour voir ton rythme sur la frise.'}
					</p>
					<input ref={fileRef} type="file" accept=".xlsx" hidden onChange={handleFile} />
					<div className="cal-settings-actions">
						<button type="button" className="cal-settings-btn" onClick={() => fileRef.current?.click()} disabled={importing}>
							<Upload size={16} aria-hidden="true" />
							{importing ? 'Lecture…' : alternanceDayCount > 0 ? 'Remplacer le fichier' : 'Importer un fichier'}
						</button>
						{alternanceDayCount > 0 && (
							<button
								type="button"
								className="cal-settings-btn cal-settings-btn--danger"
								onClick={() => { const restore = onClearAlternance(); setRestoreCleared(() => restore); setImportMsg(null); setContract(null); }}
							>
								<Trash2 size={16} aria-hidden="true" />
								Effacer
							</button>
						)}
					</div>
					{restoreCleared && alternanceDayCount === 0 && (
						<div className="cal-settings-notice" role="status">
							<span>Planning d'alternance effacé.</span>
							<button type="button" className="cal-settings-btn" onClick={() => { restoreCleared(); setRestoreCleared(null); }}>Annuler</button>
						</div>
					)}
					{importMsg && (
						<p className={importMsg.kind === 'error' ? 'cal-settings-error' : 'cal-settings-ok'} role={importMsg.kind === 'error' ? 'alert' : 'status'}>
							{importMsg.text}
						</p>
					)}
					{contract && (
						<div className="cal-settings-notice" role="status">
							<span>
								Contrat détecté du <strong>{formatShortYear(contract.start)}</strong> au <strong>{formatShortYear(contract.end)}</strong>.
							</span>
							<button type="button" className="cal-settings-btn" onClick={applyContractDates}>Utiliser ces dates</button>
						</div>
					)}
				</section>
			</div>

			<div className="modal-footer">
				<button type="button" className="cancel-button" onClick={onClose}>Fermer</button>
				<button type="submit" className="save-button" disabled={!!rangeError}>Enregistrer</button>
			</div>
		</form>
	);
};

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, sessionKey, ...formProps }) => {
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(formProps.onClose);
	onCloseRef.current = formProps.onClose;

	// Échap ferme ; le focus va dans la fenêtre à l'ouverture et revient à ce qui
	// l'a ouverte (la roue dentée) à la fermeture.
	useEffect(() => {
		if (!open) return;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		panelRef.current?.focus({ preventScroll: true });
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); }
		};
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			if (opener?.isConnected) opener.focus({ preventScroll: true });
		};
	}, [open]);

	if (typeof document === 'undefined') return null;
	return createPortal(
		<AnimatePresence>
			{open && (
				<div className="modal-overlay cal-settings-overlay" onClick={formProps.onClose}>
					<motion.div
						ref={panelRef}
						className="cal-settings-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						tabIndex={-1}
						onClick={(e) => e.stopPropagation()}
						initial={{ opacity: 0, scale: 0.9, y: -20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.9, y: -20 }}
						transition={{ duration: 0.2 }}
					>
						<SettingsForm key={sessionKey} titleId={titleId} {...formProps} />
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
};

export default SettingsDialog;
