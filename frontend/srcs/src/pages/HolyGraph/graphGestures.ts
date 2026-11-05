/**
 * Gestes tactiles du Holy Graph, hors composant : c'est du calcul pur.
 */

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;

export interface GraphView {
	scale: number;
	offsetX: number;
	offsetY: number;
}

/** Deux doigts à un instant donné : leur écart et leur milieu (coordonnées du canvas). */
export interface Pinch {
	distance: number;
	midX: number;
	midY: number;
}

export function pinchOf(a: { x: number; y: number }, b: { x: number; y: number }): Pinch {
	return {
		distance: Math.hypot(a.x - b.x, a.y - b.y),
		midX: (a.x + b.x) / 2,
		midY: (a.y + b.y) / 2,
	};
}

/**
 * Vue après un mouvement à deux doigts : le point du graphe qui était sous le
 * milieu des doigts y reste. Écarter zoome, rapprocher dézoome, et déplacer les
 * deux doigts ensemble fait glisser le graphe.
 */
export function applyPinch(view: GraphView, previous: Pinch, next: Pinch): GraphView {
	// Deux doigts confondus, avant ou après : pas de rapport exploitable.
	const ratio = previous.distance > 0 && next.distance > 0 ? next.distance / previous.distance : 1;
	const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * ratio));
	const worldX = (previous.midX - view.offsetX) / view.scale;
	const worldY = (previous.midY - view.offsetY) / view.scale;
	return {
		scale,
		offsetX: next.midX - worldX * scale,
		offsetY: next.midY - worldY * scale,
	};
}

/** Au-delà de ce déplacement (px), un doigt posé n'est plus un toucher mais un glissement. */
export const TAP_MOVE_LIMIT = 8;
/** Marge (px à l'écran) autour d'un projet pour le toucher : il est minuscule une fois dézoomé. */
export const TAP_SLOP = 10;

export interface TargetBox {
	x: number;
	y: number;
	hw: number;
	hh: number;
}

/**
 * Le projet touché. Celui réellement sous le doigt d'abord (dans l'ordre donné :
 * les projets dessinés au-dessus en premier), et seulement s'il n'y en a aucun,
 * le plus proche dans la marge. La marge seule faisait gagner un voisin : une fois
 * dézoomé elle dépasse l'écart entre deux projets, et toucher le centre de FdF
 * ouvrait fract-ol.
 */
export function pickTarget<T>(
	candidates: readonly T[],
	box: (candidate: T) => TargetBox,
	point: { x: number; y: number },
	margin = 0,
): T | null {
	let nearest: T | null = null;
	let nearestGap = Infinity;
	for (const candidate of candidates) {
		const { x, y, hw, hh } = box(candidate);
		const gapX = Math.abs(point.x - x) - hw;
		const gapY = Math.abs(point.y - y) - hh;
		if (gapX <= 0 && gapY <= 0) return candidate;
		const gap = Math.max(gapX, gapY);
		if (gap <= margin && gap < nearestGap) {
			nearest = candidate;
			nearestGap = gap;
		}
	}
	return nearest;
}
