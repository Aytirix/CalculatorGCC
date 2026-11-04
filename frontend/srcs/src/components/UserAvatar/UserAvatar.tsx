import React, { useState } from 'react';
import { avatarSrc } from '@/utils/avatar';
import './UserAvatar.scss';

/**
 * Photo de profil d'un étudiant 42.
 *
 * Photo relayée par le backend (voir utils/avatar.ts : le CDN de 42 exige un
 * jeton). Si elle ne charge pas (compte sans photo, 42 indisponible), on
 * affiche l'initiale au lieu d'une image cassée.
 */

interface UserAvatarProps {
	src: string | null | undefined;
	login: string | null | undefined;
	className?: string;
	alt?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ src, login, className, alt = '' }) => {
	const resolved = avatarSrc(src);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const initial = (login ?? '?').trim().charAt(0).toUpperCase() || '?';

	if (!resolved || failedSrc === resolved) {
		return (
			<span className={`${className ?? ''} user-avatar--fallback`} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
				{initial}
			</span>
		);
	}
	return (
		<img
			src={resolved}
			alt={alt}
			className={className}
			loading="lazy"
			decoding="async"
			onError={() => setFailedSrc(resolved)}
		/>
	);
};

export default UserAvatar;
