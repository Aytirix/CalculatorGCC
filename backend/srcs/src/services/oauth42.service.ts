import axios, { AxiosResponse } from 'axios';
import { config } from '../config/config.js';
import {
	getNextClientSecret42,
	promoteClientSecret42Next,
	markCredentialsInvalid,
	clearCredentialsInvalidIfSet,
} from '../db/configRepository.js';

/**
 * Paramètres propres à la grant OAuth. Le client_id et le client_secret ne sont
 * PAS fournis par l'appelant : le helper les injecte lui-même (et gère la bascule
 * de secret), pour que tous les points d'appel bénéficient de la rotation.
 */
export type OAuth42TokenParams =
	| { grant_type: 'authorization_code'; code: string; redirect_uri: string }
	| { grant_type: 'refresh_token'; refresh_token: string };

function postToken(clientSecret: string, params: OAuth42TokenParams): Promise<AxiosResponse> {
	return axios.post(
		config.oauth42.tokenUrl,
		{
			client_id: config.oauth42.clientId,
			client_secret: clientSecret,
			...params,
		},
		{ timeout: config.api42.requestTimeoutMs }
	);
}

/** `invalid_client` = 42 a refusé l'AUTHENTIFICATION du client (secret mauvais/révoqué). */
function isInvalidClient(error: any): boolean {
	return error?.response?.data?.error === 'invalid_client';
}

/**
 * Vrai si 42 a bel et bien AUTHENTIFIÉ le client (le secret est donc valide) mais a
 * rejeté la grant elle-même : réponse HTTP de niveau applicatif (4xx < 500) qui
 * n'est pas invalid_client — typiquement invalid_grant (code/refresh_token mort).
 * Un 5xx, un 429, un 408 ou un timeout NE prouvent rien sur la validité du secret
 * → ne doivent déclencher NI promotion NI condamnation.
 */
function clientAuthSucceeded(error: any): boolean {
	const status = error?.response?.status;
	if (typeof status !== 'number') return false; // pas de réponse (réseau/timeout)
	// 408 (Request Timeout) et 429 (Too Many Requests) sont dans les 4xx mais restent
	// TRANSITOIRES : 42 peut répondre AVANT d'avoir authentifié le client (rate limit
	// mesuré à 2/s côté 42) → ils ne prouvent pas que le secret est valide. On les
	// exclut explicitement pour ne pas promouvoir un Next non validé sur un simple hoquet.
	if (status === 408 || status === 429) return false;
	return status >= 400 && status < 500 && !isInvalidClient(error);
}

/**
 * Échange auprès de l'endpoint token de 42 avec bascule automatique de secret.
 *
 * 1. Tente avec le client_secret courant. Succès → lève un éventuel drapeau
 *    d'alerte (le secret refonctionne) et renvoie la réponse.
 * 2. Sur `invalid_client` (secret courant refusé) :
 *    - s'il existe un « Next Secret 42 », on le tente ; s'il est accepté (succès,
 *      ou grant rejetée mais client authentifié) → il est promu secret courant.
 *      Sur 5xx/429/réseau au retry → on ne touche à rien (indéterminé).
 *    - s'il n'existe pas de Next : une rotation concurrente a pu promouvoir un
 *      nouveau secret courant entre-temps → on retente une fois avec le secret
 *      courant à jour avant de condamner (anti faux positif de course TOCTOU).
 *      Sinon → credentials marqués invalides (bannière admin) + erreur propagée.
 *
 * Les erreurs autres que `invalid_client` sur le secret courant (invalid_grant,
 * réseau, 5xx…) ne touchent pas au secret et sont propagées telles quelles.
 */
export async function requestOAuth42Token(params: OAuth42TokenParams): Promise<AxiosResponse> {
	const attemptedSecret = config.oauth42.clientSecret;
	try {
		const resp = await postToken(attemptedSecret, params);
		await clearCredentialsInvalidIfSet();
		return resp;
	} catch (error: any) {
		if (!isInvalidClient(error)) throw error;

		const nextSecret = await getNextClientSecret42();

		if (!nextSecret) {
			// Pas de relais configuré. Mais une rotation concurrente a pu promouvoir un
			// nouveau secret courant entre notre lecture initiale et maintenant : si le
			// secret courant a changé, on retente une fois avec lui avant de condamner.
			const currentSecret = config.oauth42.clientSecret;
			if (currentSecret !== attemptedSecret) {
				try {
					const resp = await postToken(currentSecret, params);
					await clearCredentialsInvalidIfSet();
					return resp;
				} catch (raceError: any) {
					if (!isInvalidClient(raceError)) throw raceError;
					// Toujours invalid_client → le secret est réellement mort, on continue.
				}
			}
			await markCredentialsInvalid();
			throw error;
		}

		try {
			const resp = await postToken(nextSecret, params);
			await promoteClientSecret42Next();
			console.log('🔄 Secret 42 courant refusé (invalid_client) → bascule sur le Next Secret 42, promu secret courant.');
			return resp;
		} catch (retryError: any) {
			if (isInvalidClient(retryError)) {
				// Le Next aussi est refusé : plus aucun secret ne fonctionne.
				await markCredentialsInvalid();
			} else if (clientAuthSucceeded(retryError)) {
				// 42 a authentifié le client avec le Next (seule la grant a échoué, ex.
				// code expiré) → le Next est valide, on le promeut.
				await promoteClientSecret42Next();
				console.log('🔄 Next Secret 42 accepté par 42 (grant en échec) → promu secret courant.');
			}
			// 5xx / 429 / timeout au retry : indéterminé → on ne promeut pas et on ne
			// condamne pas, on propage simplement l'erreur.
			throw retryError;
		}
	}
}
