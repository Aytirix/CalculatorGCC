// Ce fichier délègue désormais à la base de données via configRepository.
// La configuration (CLIENT_ID_42, CLIENT_SECRET_42) est persistée dans la table `configuration`.
export {
	isConfigured,
	saveConfiguration as updateEnvConfiguration,
	loadConfigIntoEnv,
} from '../db/configRepository.js';

export { generateJWTSecret } from './cryptoUtils.js';
