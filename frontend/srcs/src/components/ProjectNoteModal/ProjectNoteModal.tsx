import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ProjectNoteModal.scss';

interface ProjectNoteModalProps {
	isOpen: boolean;
	projectName: string;
	projectId: string;
	currentNote?: string;
	onClose: () => void;
	onSave: (projectId: string, note: string) => void;
}

const ProjectNoteModal: React.FC<ProjectNoteModalProps> = ({
	isOpen,
	projectName,
	projectId,
	currentNote = '',
	onClose,
	onSave,
}) => {
	const [note, setNote] = useState(currentNote);

	useEffect(() => {
		setNote(currentNote);
	}, [currentNote, isOpen]);

	const handleSave = () => {
		onSave(projectId, note.trim());
		onClose();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			onClose();
		} else if (e.key === 'Enter' && e.ctrlKey) {
			handleSave();
		}
	};

	if (!isOpen) return null;

	return (
		<AnimatePresence>
			<div className="modal-overlay" onClick={onClose}>
				<motion.div
					className="project-note-modal"
					onClick={(e) => e.stopPropagation()}
					initial={{ opacity: 0, scale: 0.9, y: -20 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.9, y: -20 }}
					transition={{ duration: 0.2 }}
				>
					<div className="modal-header">
						<h3>Note personnelle</h3>
						<button className="close-button" onClick={onClose}>
							✕
						</button>
					</div>

					<div className="modal-body">
						<div className="project-info">
							<span className="project-label">Projet:</span>
							<span className="project-name">{projectName}</span>
						</div>

						<div className="form-group">
							<label htmlFor="project-note">Note</label>
							<textarea
								id="project-note"
								className="note-textarea"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="Ajoutez vos remarques, objectifs, ou toute information utile sur ce projet..."
								rows={6}
								autoFocus
							/>
						</div>
					</div>

					<div className="modal-footer">
						<button className="cancel-button" onClick={onClose}>
							Annuler
						</button>
						<button className="save-button" onClick={handleSave}>
							Enregistrer
						</button>
					</div>
				</motion.div>
			</div>
		</AnimatePresence>
	);
};

export default ProjectNoteModal;
