import React, { createContext, useEffect, useState } from 'react';
import { BackendAPI42Service } from '@/services/backend-api42.service';
import { setRncpData } from '@/data/rncp.data';
import type { RNCP } from '@/types/rncp.types';
import { useAuth } from '@/contexts/useAuth';

/**
 * Charge le référentiel RNCP depuis le backend, qui le construit à partir du
 * catalogue 42 en cache. Le front n'embarque plus aucune valeur d'XP.
 */

export interface RncpDataContextValue {
	rncpData: RNCP[];
	/** true tant que le référentiel n'est pas arrivé. */
	loading: boolean;
	/** Le backend n'a pas pu le fournir (API 42 injoignable et cache vide). */
	error: boolean;
	/**
	 * Recharge le référentiel depuis le backend.
	 *
	 * Il n'était récupéré qu'une fois par session : une modification appliquée
	 * depuis le panneau admin restait invisible de tous les onglets ouverts —
	 * y compris celui de l'administrateur qui venait de cliquer, qui pouvait donc
	 * conclure que l'application avait échoué. Comme l'application est une SPA,
	 * ces onglets vivent des jours.
	 */
	reload: () => void;
}

export const RncpDataContext = createContext<RncpDataContextValue>({
	rncpData: [],
	loading: true,
	error: false,
	reload: () => {},
});

export const RncpDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [rncpData, setData] = useState<RNCP[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const { isAuthenticated } = useAuth();
	/** Incrémenté par `reload()` : relance l'effet de récupération. */
	const [nonce, setNonce] = useState(0);

	useEffect(() => {
		// Sans jeton, l'appel partirait en 401 et déconnecterait l'utilisateur.
		if (!isAuthenticated) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		// Le serveur récupère le catalogue en tâche de fond ; on repolle en
		// attendant. Mais pas indéfiniment : si la récupération échoue durablement
		// (scope 42 refusé, API injoignable), l'application restait bloquée sur son
		// écran de chargement sans jamais dire pourquoi. Au bout d'une minute, on
		// abandonne et on affiche l'erreur.
		const MAX_ATTEMPTS = 20;
		let attempts = 0;

		const poll = async () => {
			try {
				const res = await BackendAPI42Service.getRncp();
				if (cancelled) return;
				if (res.loading) {
					attempts += 1;
					if (attempts >= MAX_ATTEMPTS) {
						setError(true);
						setLoading(false);
						return;
					}
					timer = setTimeout(poll, 3000);
					return;
				}
				setRncpData(res.rncp);
				setData(res.rncp);
				setError(false);
				setLoading(false);
			} catch {
				if (cancelled) return;
				setError(true);
				setLoading(false);
				timer = setTimeout(poll, 10000);
			}
		};

		poll();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [isAuthenticated, nonce]);

	return (
		<RncpDataContext.Provider
			value={{ rncpData, loading, error, reload: () => setNonce((n) => n + 1) }}
		>
			{children}
		</RncpDataContext.Provider>
	);
};
