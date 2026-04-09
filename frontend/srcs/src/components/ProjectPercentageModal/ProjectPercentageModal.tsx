import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clampPercentage } from '@/utils/projectPercentage';
import './ProjectPercentageModal.scss';

interface ProjectPercentageModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (percentage: number) => void;
	projectName: string;
	currentPercentage: number;
	maxPercentage: number;
}

const ProjectPercentageModal: React.FC<ProjectPercentageModalProps> = ({
	isOpen,
	onClose,
	onSave,
	projectName,
	currentPercentage,
	maxPercentage,
}) => {
	const [percentage, setPercentage] = useState(clampPercentage(currentPercentage, maxPercentage, 50));
	const [inputValue, setInputValue] = useState(clampPercentage(currentPercentage, maxPercentage, 50).toString());
	const presetPercentages = Array.from(new Set([50, 75, 100, maxPercentage])).filter((value) => value <= maxPercentage);
	const sliderMiddleLabel = maxPercentage > 100 ? 100 : Math.round((50 + maxPercentage) / 2);

	useEffect(() => {
		const clampedPercentage = clampPercentage(currentPercentage, maxPercentage, 50);
		setPercentage(clampedPercentage);
		setInputValue(clampedPercentage.toString());
	}, [currentPercentage, isOpen, maxPercentage]);

	const handleSave = () => {
		const value = clampPercentage(percentage, maxPercentage, 50);
		onSave(value);
		onClose();
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);

		const numValue = parseFloat(value);
		if (!isNaN(numValue)) {
			setPercentage(clampPercentage(numValue, maxPercentage, 50));
		}
	};

	const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseFloat(e.target.value);
		setPercentage(value);
		setInputValue(value.toString());
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			onClose();
		}
	};

	if (!isOpen) return null;

	return (
		<AnimatePresence>
			<div className="modal-overlay" onClick={onClose}>
				<motion.div
					className="percentage-modal"
					onClick={(e) => e.stopPropagation()}
					initial={{ opacity: 0, scale: 0.9, y: -20 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.9, y: -20 }}
					transition={{ duration: 0.2 }}
				>
					<div className="modal-header">
						<h3>Modifier le pourcentage</h3>
						<button className="close-button" onClick={onClose}>
							✕
						</button>
					</div>

					<div className="modal-body">
						<div className="project-info">
							<span className="project-label">Projet :</span>
							<span className="project-name">{projectName}</span>
						</div>

						<div className="percentage-control">
							<div className="percentage-display">
								<input
									type="number"
									className="percentage-input"
									value={inputValue}
									onChange={handleInputChange}
									onKeyDown={handleKeyDown}
									min="50"
									max={maxPercentage}
									step="1"
								/>
								<span className="percentage-symbol">%</span>
							</div>

							<div className="slider-container">
								<input
									type="range"
									className="percentage-slider"
									value={percentage}
									onChange={handleSliderChange}
									min="50"
									max={maxPercentage}
									step="1"
								/>
								<div className="slider-labels">
									<span>50%</span>
									<span className={percentage === sliderMiddleLabel ? 'highlight' : ''}>{sliderMiddleLabel}%</span>
									<span>{maxPercentage}%</span>
								</div>
							</div>

							<div className="percentage-presets">
								{presetPercentages.map((preset) => (
									<button
										key={preset}
										className={`preset-button ${percentage === preset ? 'active' : ''}`}
										onClick={() => {
											setPercentage(preset);
											setInputValue(preset.toString());
										}}
									>
										{preset}%
									</button>
								))}
							</div>

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

export default ProjectPercentageModal;
