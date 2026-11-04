import { describe, it, expect } from 'vitest';
import { avatarSrc } from './avatar';

describe('avatarSrc', () => {
	it('relaie les photos du CDN 42 par le backend (le CDN répond 403 sans jeton)', () => {
		const url = 'https://cdn.intra.42.fr/users/fe48abd92cbb4edfffed3b38c717f129/small_thmouty.jpg';
		expect(avatarSrc(url)).toBe(`/api/avatar?u=${encodeURIComponent(url)}`);
	});
	it('laisse les autres adresses telles quelles, et rien pour une URL vide', () => {
		expect(avatarSrc('/icons/icon-192.png')).toBe('/icons/icon-192.png');
		expect(avatarSrc(null)).toBeNull();
		expect(avatarSrc('')).toBeNull();
	});
});
