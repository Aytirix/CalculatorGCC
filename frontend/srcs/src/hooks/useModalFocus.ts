import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportement clavier d'une fenêtre modale :
 *  - le focus y entre à l'ouverture (sauf si un champ l'a déjà pris) ;
 *  - Tab et Maj+Tab y restent ;
 *  - Échap la ferme — sauf si une AUTRE fenêtre ouverte par-dessus (palette
 *    Ctrl+K…) a la main ;
 *  - à la fermeture, le focus revient là où il était, s'il n'est pas déjà
 *    parti ailleurs.
 */
export function useModalFocus(
	ref: RefObject<HTMLElement | null>,
	open: boolean,
	onClose: () => void,
): void {
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (!open) return;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const panel = ref.current;
		if (panel && !panel.contains(document.activeElement)) {
			const first = panel.querySelector<HTMLElement>(FOCUSABLE);
			(first ?? panel).focus({ preventScroll: true });
		}

		const onKey = (e: KeyboardEvent) => {
			const current = ref.current;
			if (!current) return;
			const target = e.target instanceof Element ? e.target : null;
			const other = target?.closest('[role="dialog"]');
			if (other && other !== current) return;

			// Échap pendant une composition (accents, IME) annule la saisie, pas la fenêtre.
			if (e.key === 'Escape' && !e.isComposing) {
				e.stopPropagation();
				onCloseRef.current();
				return;
			}
			if (e.key !== 'Tab') return;
			const focusables = [...current.querySelectorAll<HTMLElement>(FOCUSABLE)];
			if (focusables.length === 0) {
				e.preventDefault();
				return;
			}
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const active = document.activeElement;
			if (!current.contains(active)) {
				e.preventDefault();
				(e.shiftKey ? last : first).focus();
			} else if (e.shiftKey && active === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			const active = document.activeElement;
			const lost = !active || active === document.body || !!panel?.contains(active);
			if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
		};
	}, [open, ref]);
}
