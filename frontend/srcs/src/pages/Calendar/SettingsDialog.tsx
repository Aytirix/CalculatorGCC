import React, { useEffect, useId, useRef, useState } from 'react';
import { CalendarRange, FileSpreadsheet, Trash2, Upload, X } from 'lucide-react';
import {
	formatDateKey, formatShortYear, parseDateKey, plural, validateDateRange,
	type DateRange,
} from './calendarModel';

/**
 * Réglages du calendrier (roue dentée en haut de page) : la période affichée
 * et le planning d'alternance. Rassemblés ici pour libérer la barre d'outils —
 * on les règle une fois, on ne s'en sert pas à chaque visite.
 *
 * `<dialog>` natif + showModal() : Échap, piège du focus et premier plan sont
 * gérés par le navigateur. Le formulaire est RECRÉÉ à chaque ouverture
 * (`sessionKey`) : une saisie abandonnée (Échap, clic à côté) ne réapparaît
 * jamais à l'ouverture suivante — constaté avec une recopie manuelle de l'état.
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

	// Appliqué tout de suite (comme l'ancien « Oui ») : l'import l'est déjà, et
	// fermer la fenêtre ne doit pas perdre ces dates.
	const applyContractDates = () => {
		if (!contract || validateDateRange(contract.start, contract.end) !== null) return;
		onSaveRange(contract);
		setStart(formatDateKey(contract.start));
		setEnd(formatDateKey(contract.end));
		setContract(null);
		setImportMsg({ kind: 'ok', text: 'Période adaptée aux dates du contrat.' });
	};

	return (
		<form className="cal-dialog-body" onSubmit={handleSave}>
			<div className="cal-dialog-head">
				<h2 id={titleId}>Réglages du calendrier</h2>
				<button type="button" className="cal-icon-btn cal-icon-btn--ghost" onClick={onClose} aria-label="Fermer les réglages">
					<X size={18} aria-hidden="true" />
				</button>
			</div>

			<section className="cal-dialog-section" aria-labelledby={`${titleId}-range`}>
				<h3 id={`${titleId}-range`}><CalendarRange size={16} aria-hidden="true" />Période affichée</h3>
				<p className="cal-muted">En général, la durée de ton contrat d'alternance.</p>
				<div className="cal-dialog-dates">
					<label>
						<span>Du</span>
						<input type="date" value={start} onChange={ev => setStart(ev.target.value)} required />
					</label>
					<label>
						<span>Au</span>
						<input type="date" value={end} onChange={ev => setEnd(ev.target.value)} min={start || undefined} required />
					</label>
				</div>
				{rangeError && <p className="cal-field-error" role="alert">{rangeError}</p>}
			</section>

			<section className="cal-dialog-section" aria-labelledby={`${titleId}-alt`}>
				<h3 id={`${titleId}-alt`}><FileSpreadsheet size={16} aria-hidden="true" />Planning d'alternance</h3>
				<p className="cal-muted">
					{alternanceDayCount > 0
						? `Importé : ${plural(alternanceDayCount, 'jour')} coloré${alternanceDayCount > 1 ? 's' : ''} (école, entreprise, distanciel). Un nouvel import s'applique tout de suite.`
						: 'Importe le fichier .xlsx de ton école pour voir ton rythme sur la frise.'}
				</p>
				<input ref={fileRef} type="file" accept=".xlsx" hidden onChange={handleFile} />
				<div className="cal-dialog-actions-row">
					<button type="button" className="cal-btn" onClick={() => fileRef.current?.click()} disabled={importing}>
						<Upload size={16} aria-hidden="true" />
						{importing ? 'Lecture…' : alternanceDayCount > 0 ? 'Remplacer le fichier' : 'Importer un fichier'}
					</button>
					{alternanceDayCount > 0 && (
						<button type="button" className="cal-btn cal-btn--danger-quiet" onClick={() => { const restore = onClearAlternance(); setRestoreCleared(() => restore); setImportMsg(null); setContract(null); }}>
							<Trash2 size={16} aria-hidden="true" />
							Effacer
						</button>
					)}
				</div>
				{restoreCleared && alternanceDayCount === 0 && (
					<div className="cal-dialog-contract" role="status">
						<span>Planning d'alternance effacé.</span>
						<button type="button" className="cal-btn" onClick={() => { restoreCleared(); setRestoreCleared(null); }}>Annuler</button>
					</div>
				)}
				{importMsg && (
					<p className={importMsg.kind === 'error' ? 'cal-field-error' : 'cal-field-ok'} role={importMsg.kind === 'error' ? 'alert' : 'status'}>
						{importMsg.text}
					</p>
				)}
				{contract && (
					<div className="cal-dialog-contract" role="status">
						<span>
							Contrat détecté du <strong>{formatShortYear(contract.start)}</strong> au <strong>{formatShortYear(contract.end)}</strong>.
						</span>
						<button type="button" className="cal-btn" onClick={applyContractDates}>Utiliser ces dates</button>
					</div>
				)}
			</section>

			<div className="cal-dialog-foot">
				<button type="button" className="cal-btn" onClick={onClose}>Fermer</button>
				<button type="submit" className="cal-btn cal-btn--primary" disabled={!!rangeError}>Enregistrer</button>
			</div>
		</form>
	);
};

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, sessionKey, ...formProps }) => {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const onCloseRef = useRef(formProps.onClose);
	onCloseRef.current = formProps.onClose;

	useEffect(() => {
		const dlg = dialogRef.current;
		if (!dlg) return;
		if (open && !dlg.open) dlg.showModal();
		else if (!open && dlg.open) dlg.close();
	}, [open]);

	// Fermeture par le navigateur (Échap…) : écouteur natif. La prop React
	// `onClose` ne remettait pas l'état à « fermé » (constaté) — la roue dentée
	// ne rouvrait alors plus rien.
	useEffect(() => {
		const dlg = dialogRef.current;
		if (!dlg) return;
		const handle = () => onCloseRef.current();
		dlg.addEventListener('close', handle);
		return () => dlg.removeEventListener('close', handle);
	}, []);

	return (
		<dialog
			ref={dialogRef}
			className="cal-dialog"
			aria-labelledby={titleId}
			onClick={ev => { if (ev.target === dialogRef.current) formProps.onClose(); }}
		>
			{open && <SettingsForm key={sessionKey} titleId={titleId} {...formProps} />}
		</dialog>
	);
};

export default SettingsDialog;
