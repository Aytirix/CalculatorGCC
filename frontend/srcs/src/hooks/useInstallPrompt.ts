import { useSyncExternalStore } from 'react';
import { getInstallState, subscribeInstall, type InstallState } from '@/services/installPrompt';

const SERVER_STATE: InstallState = { canPrompt: false, installed: false, mobile: false, ios: false };

/** État d'installation de l'application, mis à jour quand le navigateur change d'avis. */
export function useInstallPrompt(): InstallState {
	return useSyncExternalStore(subscribeInstall, getInstallState, () => SERVER_STATE);
}
