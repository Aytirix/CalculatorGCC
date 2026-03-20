import React, { useEffect, useState } from 'react';
import { simulationService } from '@/services/simulation.service';
import './TeammateModal.scss';

interface TeammateModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectId: string;
	projectName: string;
}

interface SimUser {
	login: string;
	userId42: number;
}

const TeammateModal: React.FC<TeammateModalProps> = ({
	isOpen,
	onClose,
	projectId,
	projectName,
}) => {
	const [simUsers, setSimUsers] = useState<SimUser[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen) return;

		setSimUsers([]);
		setError(null);
		setLoading(true);

		simulationService.getProjectUsers(projectId)
			.then(setSimUsers)
			.catch(() => setError('Impossible de charger les utilisateurs'))
			.finally(() => setLoading(false));
	}, [isOpen, projectId]);

	if (!isOpen) return null;

	return (
		<div className="teammate-modal-overlay" onClick={onClose}>
			<div className="teammate-modal" onClick={(e) => e.stopPropagation()}>
				<div className="teammate-modal__header">
					<h3 className="teammate-modal__title">Trouver des teammates</h3>
					<p className="teammate-modal__project">{projectName}</p>
					<button className="teammate-modal__close" onClick={onClose}>×</button>
				</div>

				<div className="teammate-modal__body">
					<div className="teammate-modal__section">
						<h4 className="teammate-modal__section-title">
							Via CalculatorGCC
							{!loading && <span className="teammate-modal__count">{simUsers.length}</span>}
						</h4>
						{loading ? (
							<p className="teammate-modal__loading">Chargement...</p>
						) : error ? (
							<p className="teammate-modal__error">{error}</p>
						) : simUsers.length === 0 ? (
							<p className="teammate-modal__empty">Personne n'a simulé ce projet</p>
						) : (
							<ul className="teammate-modal__list">
								{simUsers.map((u) => (
									<li key={u.userId42} className="teammate-modal__item">
										<span className="teammate-modal__login">{u.login}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default TeammateModal;
