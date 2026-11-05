import { useEffect, useState } from 'react';

/** Vrai tant que la requête média correspond (suit les changements de taille). */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
	useEffect(() => {
		const mql = window.matchMedia(query);
		const onChange = () => setMatches(mql.matches);
		onChange();
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	}, [query]);
	return matches;
}
