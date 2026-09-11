import { createContext } from 'react';

/**
 * « La connexion 42 peut-elle aboutir depuis cette adresse ? »
 *
 * Posé une fois par `App` à partir de `useSetupCheck`, consommé par les écrans
 * qui doivent en tenir compte — le bandeau d'avertissement et le bouton de
 * connexion. Un contexte plutôt qu'un second appel au hook : la question part
 * d'une requête réseau, on ne la pose pas deux fois par rendu.
 *
 * `null` = on ne sait pas (pas encore demandé, réseau muet, ou instance qui ne
 * fait pas autorité). Seul un `false` explicite justifie d'avertir.
 */
export const OriginStatusContext = createContext<{ originAllowed: boolean | null }>({
	originAllowed: null,
});
