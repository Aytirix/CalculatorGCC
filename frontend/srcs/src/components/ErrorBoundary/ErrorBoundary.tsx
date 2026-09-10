import React from 'react';

/**
 * Dernier filet de l'application.
 *
 * Sans lui, une erreur levée pendant un rendu vide `#root` et laisse un écran noir
 * MUET : ni message, ni bouton, rien dans la console qui saute aux yeux. C'est
 * arrivé au moins deux fois — un blob de sous-projets au prototype pollué
 * (cf. `Dashboard.tsx`), puis un remplacement à chaud raté après suppression d'un
 * module. Dans les deux cas, la page était simplement blanche ou noire.
 *
 * La cause la plus fréquente en production est un onglet resté ouvert sur du code
 * périmé : recharger suffit. D'où les deux boutons, le second forçant le
 * contournement du cache.
 *
 * Styles EN LIGNE à dessein : ce composant doit s'afficher même si la feuille de
 * styles n'a pas pu être chargée — c'est justement une des pannes qu'il couvre.
 */

interface Props {
	children: React.ReactNode;
}

interface State {
	/**
	 * Indicateur SÉPARÉ de la valeur : `throw null`, `throw 0` ou `throw undefined`
	 * sont du JavaScript légal. Tester la vérité de `error` faisait alors re-rendre
	 * le sous-arbre fautif, qui relançait aussitôt — boucle infinie de rendu.
	 */
	aEchoue: boolean;
	error: unknown;
}

const couleurs = {
	fond: 'var(--bg-primary, #1a1a1a)',
	carte: 'var(--bg-card, #2a2a2a)',
	texte: 'var(--text-primary, #ffffff)',
	discret: 'var(--text-muted, #9ca3af)',
	bordure: 'var(--border-color, rgba(255,255,255,0.12))',
	accent: 'var(--color-primary, #3b82f6)',
};

export class ErrorBoundary extends React.Component<Props, State> {
	state: State = { aEchoue: false, error: null };

	static getDerivedStateFromError(error: unknown): State {
		return { aEchoue: true, error };
	}

	componentDidCatch(error: unknown, info: React.ErrorInfo) {
		// Laisser une trace exploitable : sans elle, l'erreur d'origine disparaît
		// avec l'arbre démonté et il ne reste rien à examiner.
		console.error('[ErrorBoundary] Rendu interrompu :', error, info.componentStack);
	}

	/** Recharge en contournant le cache : la cause la plus courante est du code périmé. */
	private rechargerSansCache = () => {
		const url = new URL(window.location.href);
		url.searchParams.set('_', Date.now().toString(36));
		window.location.replace(url.toString());
	};

	render() {
		const { aEchoue, error } = this.state;
		if (!aEchoue) return this.props.children;

		// La valeur lancée n'est pas forcément une Error.
		const message = error instanceof Error ? error.message : String(error);
		const pile = error instanceof Error && error.stack ? error.stack : '';

		return (
			<div
				role="alert"
				style={{
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: '1.5rem',
					background: couleurs.fond,
					color: couleurs.texte,
					fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
				}}
			>
				<div
					style={{
						width: '100%',
						maxWidth: '32rem',
						padding: '2rem',
						borderRadius: '16px',
						border: `1px solid ${couleurs.bordure}`,
						background: couleurs.carte,
					}}
				>
					<div style={{ fontSize: '2.5rem', lineHeight: 1, marginBottom: '1rem' }} aria-hidden="true">
						⚠️
					</div>
					<h1 style={{ margin: '0 0 0.75rem', fontSize: '1.4rem', fontWeight: 700 }}>
						L'affichage s'est interrompu
					</h1>
					<p style={{ margin: '0 0 1.5rem', lineHeight: 1.6, color: couleurs.discret }}>
						Le plus souvent, cet onglet tourne encore sur une version périmée du site.
						Recharger suffit à repartir — vos données ne sont pas touchées.
					</p>

					<div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
						<button
							type="button"
							onClick={this.rechargerSansCache}
							style={{
								padding: '0.7rem 1.3rem',
								border: 0,
								borderRadius: '10px',
								background: couleurs.accent,
								color: '#fff',
								fontSize: '0.95rem',
								fontWeight: 600,
								fontFamily: 'inherit',
								cursor: 'pointer',
							}}
						>
							Recharger la page
						</button>
						<button
							type="button"
							onClick={() => window.location.assign('/')}
							style={{
								padding: '0.7rem 1.3rem',
								border: `1px solid ${couleurs.bordure}`,
								borderRadius: '10px',
								background: 'transparent',
								color: couleurs.texte,
								fontSize: '0.95rem',
								fontFamily: 'inherit',
								cursor: 'pointer',
							}}
						>
							Retour à l'accueil
						</button>
					</div>

					{/* Replié : sans intérêt pour un visiteur, indispensable pour diagnostiquer
					    quand quelqu'un rapporte le problème. */}
					<details style={{ marginTop: '1.5rem' }}>
						<summary style={{ cursor: 'pointer', color: couleurs.discret, fontSize: '0.85rem' }}>
							Détail technique
						</summary>
						<pre
							style={{
								marginTop: '0.75rem',
								padding: '0.75rem',
								borderRadius: '8px',
								background: couleurs.fond,
								color: couleurs.discret,
								fontSize: '0.78rem',
								lineHeight: 1.5,
								whiteSpace: 'pre-wrap',
								wordBreak: 'break-word',
								maxHeight: '12rem',
								overflow: 'auto',
							}}
						>
							{message}
							{pile ? `\n\n${pile.split('\n').slice(0, 8).join('\n')}` : ''}
						</pre>
					</details>
				</div>
			</div>
		);
	}
}

export default ErrorBoundary;
