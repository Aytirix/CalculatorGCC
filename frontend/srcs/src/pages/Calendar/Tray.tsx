import React, { useMemo, useState } from 'react';
import { GripVertical, Plus, Search } from 'lucide-react';
import type { SimulatorProject } from '@/types/rncp.types';
import { PROJECT_DRAG_TYPE } from './Timeline';
import { formatXp } from './calendarModel';

/**
 * Projets simulés pas encore datés. Deux façons de placer, au choix :
 * glisser sur la frise / un jour (souris), ou le bouton + (partout, y compris
 * au doigt et au clavier) qui place le projet là où l'on regarde : au centre
 * de la frise visible, ou au jour sélectionné en vue Mois.
 */

interface TrayProps {
	projects: SimulatorProject[];
	onPlace: (project: SimulatorProject) => void;
	layout: 'column' | 'strip';
	canDrop: boolean;
}

const Tray: React.FC<TrayProps> = ({ projects, onPlace, layout, canDrop }) => {
	const [query, setQuery] = useState('');
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects;
	}, [projects, query]);

	return (
		<section className={`cal-card cal-tray cal-tray--${layout}`} aria-labelledby="cal-tray-title">
			<div className="cal-tray-head">
				<h2 id="cal-tray-title">À placer</h2>
				<span className="cal-count"><span aria-hidden="true">{projects.length}</span><span className="cal-sr-only">{projects.length > 1 ? `${projects.length} projets` : `${projects.length} projet`}</span></span>
				{layout === 'strip' && projects.length > 0 && (
					<span className="cal-muted cal-tray-hint-inline">
						{canDrop ? 'Glisse un projet sur la frise ou sur un jour, ou appuie sur +' : 'Appuie sur + pour placer un projet'}
					</span>
				)}
			</div>

			{projects.length === 0 ? (
				<p className="cal-muted cal-tray-empty">
					Tous tes projets simulés sont datés. Coche des projets dans le simulateur pour les retrouver ici.
				</p>
			) : (
				<>
					{layout === 'column' && (
						<>
							<p className="cal-muted cal-tray-hint">
								{canDrop ? 'Glisse un projet sur la frise ou un jour, ou appuie sur + pour le placer.' : 'Appuie sur + pour placer un projet.'}
							</p>
							{projects.length > 5 && (
								<label className="cal-search">
									<Search size={16} aria-hidden="true" />
									<span className="cal-sr-only">Rechercher un projet à placer</span>
									<input type="search" placeholder="Rechercher" value={query} onChange={e => setQuery(e.target.value)} />
								</label>
							)}
						</>
					)}
					<ul className="cal-tray-list">
						{filtered.map(p => (
							<li
								key={p.id}
								className="cal-tray-item"
								draggable={canDrop}
								onDragStart={e => {
									e.dataTransfer.setData(PROJECT_DRAG_TYPE, p.id);
									e.dataTransfer.effectAllowed = 'copy';
								}}
							>
								{canDrop && <GripVertical className="cal-tray-grip" size={16} aria-hidden="true" />}
								<span className="cal-row-main">
									<span className="cal-row-title">{p.name}</span>
									<span className="cal-row-sub">{formatXp(p.xp)} XP</span>
								</span>
								<button type="button" className="cal-icon-btn cal-icon-btn--primary" onClick={e => { if (e.detail <= 1) onPlace(p); }} aria-label={`Placer ${p.name} dans le calendrier`}>
									<Plus size={18} aria-hidden="true" />
								</button>
							</li>
						))}
						{filtered.length === 0 && <li className="cal-muted">Aucun résultat.</li>}
					</ul>
				</>
			)}
		</section>
	);
};

export default Tray;
