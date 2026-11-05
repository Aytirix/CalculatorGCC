import { useEffect, type RefObject } from 'react';

/**
 * Fait suivre le défilement à un panneau latéral, sans qu'il sorte de la zone
 * de son conteneur. `position: sticky` ne colle pas dans cette app : le CSS
 * global `body { overflow-x: hidden }` fait du body un conteneur de défilement.
 */
export function useFollowScroll(
	containerRef: RefObject<HTMLElement | null>,
	panelRef: RefObject<HTMLElement | null>,
	enabled: boolean,
	top = 16,
): void {
	useEffect(() => {
		if (!enabled) return;
		const update = () => {
			const container = containerRef.current;
			const panel = panelRef.current;
			if (!container || !panel) return;
			const room = Math.max(0, container.offsetHeight - panel.offsetHeight);
			const offset = Math.max(0, Math.min(top - container.getBoundingClientRect().top, room));
			panel.style.transform = offset > 0 ? `translateY(${Math.round(offset)}px)` : '';
		};
		update();
		const panelAtStart = panelRef.current;
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		const observer = new ResizeObserver(update);
		if (containerRef.current) observer.observe(containerRef.current);
		if (panelRef.current) observer.observe(panelRef.current);
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
			observer.disconnect();
			if (panelAtStart) panelAtStart.style.transform = '';
		};
	}, [containerRef, panelRef, enabled, top]);
}
