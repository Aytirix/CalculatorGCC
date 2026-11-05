import { describe, expect, it } from 'vitest';
import { applyPinch, MAX_SCALE, MIN_SCALE, pinchOf } from './graphGestures';

const view = { scale: 1, offsetX: 100, offsetY: 50 };
/** Point du graphe affiché à (x, y) de l'écran. */
const worldAt = (v: typeof view, x: number, y: number) => ({ x: (x - v.offsetX) / v.scale, y: (y - v.offsetY) / v.scale });

describe('pinchOf', () => {
	it('écart et milieu des deux doigts', () => {
		expect(pinchOf({ x: 0, y: 0 }, { x: 30, y: 40 })).toEqual({ distance: 50, midX: 15, midY: 20 });
	});
});

describe('applyPinch', () => {
	it('écarter les doigts zoome, le point sous les doigts ne bouge pas', () => {
		const prev = { distance: 100, midX: 200, midY: 200 };
		const next = applyPinch(view, prev, { distance: 200, midX: 200, midY: 200 });
		expect(next.scale).toBe(2);
		expect(worldAt(next, 200, 200)).toEqual(worldAt(view, 200, 200));
	});

	it('rapprocher les doigts dézoome', () => {
		const next = applyPinch(view, { distance: 200, midX: 0, midY: 0 }, { distance: 100, midX: 0, midY: 0 });
		expect(next.scale).toBe(0.5);
	});

	it('déplacer les deux doigts ensemble fait glisser le graphe, sans zoomer', () => {
		const next = applyPinch(view, { distance: 100, midX: 200, midY: 200 }, { distance: 100, midX: 230, midY: 180 });
		expect(next).toEqual({ scale: 1, offsetX: 130, offsetY: 30 });
	});

	it('le zoom reste borné', () => {
		const start = { distance: 1, midX: 0, midY: 0 };
		expect(applyPinch(view, start, { distance: 1000, midX: 0, midY: 0 }).scale).toBe(MAX_SCALE);
		expect(applyPinch(view, { distance: 1000, midX: 0, midY: 0 }, start).scale).toBe(MIN_SCALE);
	});

	it('deux doigts au même endroit : le zoom ne part pas en vrille', () => {
		const next = applyPinch(view, { distance: 0, midX: 10, midY: 10 }, { distance: 50, midX: 10, midY: 10 });
		expect(next.scale).toBe(1);
	});
});
