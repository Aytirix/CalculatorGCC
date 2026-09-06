import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header/Header';
import {
  BackendAPI42Service,
  type HolyGraphCursus,
  type HolyGraphEdge,
  type HolyGraphProject,
  type HolyGraphProjectDetailsResponse,
} from '@/services/backend-api42.service';
import { isReadOnlyMode, simulationService, type SimulationData } from '@/services/simulation.service';
import { clampPercentage, getProjectMaxPercentage } from '@/utils/projectPercentage';
import { findRncpProject, graphSimulationId, isGraphSimulationId } from '@/utils/holyGraphSimulation';
import type { SimulatorProject } from '@/types/rncp.types';
import ProjectPanel from './ProjectPanel';
import { STATUS_LABELS, STATUS_STYLES, statusOf } from './projectStatus';
import './HolyGraph.scss';

/**
 * Rayon d'un nœud, dans les unités du graphe officiel de 42.
 *
 * Calibré sur la donnée réelle : sur le graphe officiel, so_long / FdF /
 * fract-ol sont alignés et espacés de 100.8 unités, avec leurs bordures qui
 * se touchent — donc un rayon de 50. Confirmé sur l'ensemble des nœuds : la
 * distance au plus proche voisin ne descend jamais sous ~100 (2 × 50).
 */
const NODE_RADIUS = 50;

/**
 * Épaisseur de bordure exprimée dans les unités du graphe (donc elle grandit
 * et rétrécit avec le zoom, comme sur l'intra). En unités écran, la bordure
 * paraissait énorme sur des nœuds minuscules une fois dézoomé.
 */
const NODE_BORDER = 7;
/** Survol : à peine plus épais, juste de quoi signaler le nœud visé. */
const NODE_BORDER_HOVER = 9;
/** Projet sélectionné, épinglé par la recherche ou simulé : marquage franc. */
const NODE_BORDER_EMPHASIS = 11;

/** Jaune : projet mis en avant depuis la recherche. */
const HIGHLIGHT_COLOR = '#facc15';
/** Violet : projet ajouté à la simulation depuis ce graphe. */
const SIMULATED_COLOR = '#a78bfa';

/** Pourcentage de validation minimum d'un projet simulé (identique au Dashboard). */
const MIN_PERCENTAGE = 50;

/** Sur l'intra, seuls les examens et les piscines sont dessinés en rectangle. */
const RECT_KINDS = new Set(['exam', 'piscine']);
const RECT_WIDTH = NODE_RADIUS * 2.5;
const RECT_HEIGHT = NODE_RADIUS * 1.15;

function isRect(p: HolyGraphProject): boolean {
  return RECT_KINDS.has(p.kind);
}

/** Demi-largeur / demi-hauteur utilisées pour le rendu ET le survol. */
function halfSize(p: HolyGraphProject): { hw: number; hh: number } {
  return isRect(p)
    ? { hw: RECT_WIDTH / 2, hh: RECT_HEIGHT / 2 }
    : { hw: NODE_RADIUS, hh: NODE_RADIUS };
}

/**
 * Ordre de dessin : les projets déjà faits passent SOUS les projets encore
 * disponibles (c'est ce que fait l'intra — un projet validé est partiellement
 * masqué par ses voisins non commencés, pas l'inverse).
 */
const DRAW_ORDER = ['validated', 'finished', 'waiting_for_correction', 'in_progress', 'available'];

function drawPriority(p: HolyGraphProject): number {
  const index = DRAW_ORDER.indexOf(statusOf(p));
  return index === -1 ? DRAW_ORDER.length : index;
}

/**
 * Les « cercles » du tronc commun, tels que 42 les dessine.
 *
 * Le layout officiel est posé sur un canevas fixe dont l'origine est (3000,3000) :
 * Libft (cercle 0) y est exactement, et les projets se répartissent ensuite sur
 * des anneaux réguliers — mesuré sur les données réelles :
 *   166 → Born2beroot, get_next_line, ft_printf
 *   332 → so_long, FdF, fract-ol, push_swap, pipex, minitalk, Exam Rank 02
 *   498 → minishell, Philosophers, Exam Rank 03
 *   664 → cub3d, miniRT, NetPractice, CPP Modules, Exam Rank 04
 *   830 → Inception, webserv, Exam Rank 05
 *   996 → ft_transcendence, Exam Rank 06
 * Au-delà du 6e cercle, on sort du tronc commun.
 *
 * Le pas est redérivé des données à chaque fois plutôt que codé en dur, et on
 * ne dessine rien si la structure attendue ne s'y retrouve pas (autre cursus,
 * ou layout modifié par 42) : mieux vaut aucun cercle que de faux cercles.
 */
const CORE_CENTER = { x: 3000, y: 3000 };
const CORE_RING_COUNT = 6;

function computeCoreRings(projects: HolyGraphProject[]): { cx: number; cy: number; radii: number[] } | null {
  if (projects.length === 0) return null;

  const distances = projects
    .map((p) => Math.hypot(p.x - CORE_CENTER.x, p.y - CORE_CENTER.y))
    .filter((d) => d > NODE_RADIUS)
    .sort((a, b) => a - b);
  if (distances.length === 0) return null;

  // Premier paquet de distances = premier cercle, dont on tire le pas.
  const RING_GAP = 60;
  const firstGroup: number[] = [distances[0]];
  for (let i = 1; i < distances.length && distances[i] - distances[i - 1] < RING_GAP; i++) {
    firstGroup.push(distances[i]);
  }
  if (firstGroup.length < 3) return null;
  const step = firstGroup.reduce((s, d) => s + d, 0) / firstGroup.length;

  // On n'accepte les cercles suivants que s'ils portent vraiment des projets.
  const TOLERANCE = 45;
  const radii: number[] = [];
  for (let n = 1; n <= CORE_RING_COUNT; n++) {
    const target = step * n;
    const onRing = distances.filter((d) => Math.abs(d - target) <= TOLERANCE).length;
    if (onRing >= 2) radii.push(target);
  }

  return radii.length >= 3 ? { cx: CORE_CENTER.x, cy: CORE_CENTER.y, radii } : null;
}

/**
 * Écarte les projets HORS tronc commun qui se chevauchent encore.
 *
 * Le layout officiel superpose quelques projets périphériques (Piscine RoR /
 * Django / Symfony, Abstract_data / Piscine Object…), ce qui les rend
 * illisibles. On les repousse juste assez pour qu'ils ne se recouvrent plus,
 * en laissant le tronc commun EXACTEMENT à sa place officielle.
 */
function spreadOuterOverlaps(
  projects: HolyGraphProject[],
  edges: HolyGraphEdge[],
  rings: { cx: number; cy: number; radii: number[] } | null
): { projects: HolyGraphProject[]; edges: HolyGraphEdge[] } {
  if (projects.length === 0) return { projects, edges };

  const coreLimit = rings ? Math.max(...rings.radii) + NODE_RADIUS * 1.5 : 0;
  const isCore = (p: HolyGraphProject) =>
    rings != null && Math.hypot(p.x - rings.cx, p.y - rings.cy) <= coreLimit;

  const moved = projects.map((p) => ({ ...p }));
  const MIN_GAP = NODE_RADIUS * 2 + 6;

  for (let iteration = 0; iteration < 60; iteration++) {
    let adjusted = false;
    for (let i = 0; i < moved.length; i++) {
      for (let j = i + 1; j < moved.length; j++) {
        const a = moved[i];
        const b = moved[j];
        if (isCore(a) && isCore(b)) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= MIN_GAP) continue;
        if (dist < 0.01) {
          dx = 1;
          dy = 0;
          dist = 1;
        }

        const push = (MIN_GAP - dist) / 2;
        const ux = (dx / dist) * push;
        const uy = (dy / dist) * push;
        // Un nœud du tronc commun ne bouge jamais : tout le déplacement est
        // absorbé par le projet périphérique.
        if (isCore(a)) {
          b.x += ux * 2;
          b.y += uy * 2;
        } else if (isCore(b)) {
          a.x -= ux * 2;
          a.y -= uy * 2;
        } else {
          a.x -= ux;
          a.y -= uy;
          b.x += ux;
          b.y += uy;
        }
        adjusted = true;
      }
    }
    if (!adjusted) break;
  }

  // Les liens doivent suivre les nœuds déplacés : sinon leurs extrémités
  // restent en arrière et on voit des traits détachés qui flottent.
  const ATTACH_REACH = NODE_RADIUS + 12;
  const shifts = projects
    .map((original, index) => ({
      x: original.x,
      y: original.y,
      dx: moved[index].x - original.x,
      dy: moved[index].y - original.y,
    }))
    .filter((s) => s.dx !== 0 || s.dy !== 0);

  const dragEndpoint = (x: number, y: number): { x: number; y: number } => {
    let best: { x: number; y: number } | null = null;
    let bestDist = ATTACH_REACH;
    for (const s of shifts) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= bestDist) {
        bestDist = d;
        best = { x: x + s.dx, y: y + s.dy };
      }
    }
    return best ?? { x, y };
  };

  const movedEdges = edges.map((e) => {
    const a = dragEndpoint(e.x1, e.y1);
    const b = dragEndpoint(e.x2, e.y2);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });

  return { projects: moved, edges: movedEdges };
}

const HolyGraph: React.FC = () => {
  const [data, setData] = useState<HolyGraphCursus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCursusId, setActiveCursusId] = useState<number | null>(null);
  const [hovered, setHovered] = useState<HolyGraphProject | null>(null);
  // Projet ouvert dans le panneau de détail (clic sur un nœud).
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<HolyGraphProjectDetailsResponse | null>(null);
  // Simulation de l'utilisateur, partagée avec le Dashboard : chargée telle
  // quelle et resauvegardée entière, pour ne rien écraser au passage.
  const [simData, setSimData] = useState<SimulationData | null>(null);
  const [activeLayer, setActiveLayer] = useState<string>('');
  const [search, setSearch] = useState('');
  // La liste de résultats ne s'affiche que quand le champ a le focus ; elle
  // réapparaît si on y revient, et disparaît si on clique ailleurs.
  const [searchFocused, setSearchFocused] = useState(false);
  // Projet mis en avant depuis la recherche : reste en jaune jusqu'à ce qu'on
  // retouche au graphe (déplacement, zoom ou clic).
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  const readOnly = isReadOnlyMode();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Position du bouton enfoncé : sert à distinguer un clic d'un déplacement.
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // scale/offset transforment les coordonnées OFFICIELLES de 42 en pixels écran.
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const lastSizeRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await BackendAPI42Service.getHolyGraph();
        if (cancelled) return;
        setData(res.cursus);
        setActiveCursusId((prev) => prev ?? (res.cursus.length > 0 ? res.cursus[0].id : null));
        setLoading(false);
        setError(null);
        if (res.cursus.some((c) => c.loading)) {
          timer = setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) {
          setError('Impossible de récupérer le Holy Graph pour le moment.');
          setLoading(false);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Simulation existante (celle du Dashboard) : sans elle on ne saurait pas
  // quels projets sont déjà simulés, ni avec quel pourcentage.
  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    simulationService
      .load()
      .then((loaded) => {
        if (!cancelled) setSimData(loaded);
      })
      .catch((err) => console.warn('[HolyGraph] Simulation non chargée :', err));
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

  // Le timer de sauvegarde ne doit pas survivre à la page (save perdu / fuite).
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  /**
   * Applique une modification de la simulation puis la sauvegarde (différée).
   * On renvoie TOUJOURS l'objet complet : le backend remplace l'ensemble, donc
   * repartir de ce qu'on a chargé évite d'effacer ce que le Dashboard y met.
   */
  const persistSimulation = useCallback((next: SimulationData) => {
    setSimData(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      simulationService
        .save(next)
        .catch((err) => console.warn('[HolyGraph] Sauvegarde de la simulation échouée :', err));
    }, 800);
  }, []);

  const activeCursusRaw = useMemo(
    () => data?.find((c) => c.id === activeCursusId) ?? null,
    [data, activeCursusId]
  );

  // Positions officielles + cercles du tronc commun, avec le seul ajustement
  // qu'on s'autorise : écarter les projets périphériques qui se recouvrent.
  const activeCursus = useMemo(() => {
    if (!activeCursusRaw) return null;
    const rings = computeCoreRings(activeCursusRaw.projects);
    const spread = spreadOuterOverlaps(activeCursusRaw.projects, activeCursusRaw.edges, rings);
    return { ...activeCursusRaw, rings, projects: spread.projects, edges: spread.edges };
  }, [activeCursusRaw]);

  const selectedProject = useMemo(
    () => activeCursus?.projects.find((p) => p.id === selectedId) ?? null,
    [activeCursus, selectedId]
  );

  /**
   * Identifiant sous lequel un projet du graphe est simulé, et le projet RNCP
   * correspondant quand il en existe un (son XP et son plafond de pourcentage
   * font alors foi).
   */
  const simulationTargetOf = useCallback((project: HolyGraphProject) => {
    const rncp = findRncpProject(project);
    return { id: rncp?.id ?? graphSimulationId(project.id), rncp };
  }, []);

  /** Projets du graphe actuellement dans la simulation (pastille violette). */
  const simulatedProjectIds = useMemo(() => {
    const ids = new Set<number>();
    if (!simData || !activeCursus) return ids;
    const simulated = new Set(simData.simulatedProjects.map((p) => p.projectId));
    for (const project of activeCursus.projects) {
      if (simulated.has(simulationTargetOf(project).id)) ids.add(project.id);
    }
    return ids;
  }, [simData, activeCursus, simulationTargetOf]);

  // Détail du projet ouvert. Le serveur répond `loading` tant que le catalogue
  // des sessions du campus n'est pas en cache : on repolle comme pour le graphe.
  useEffect(() => {
    if (selectedId == null || activeCursusId == null) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cursusId = activeCursusId;

    const poll = async () => {
      try {
        const res = await BackendAPI42Service.getProjectDetails(selectedId, cursusId);
        if (cancelled) return;
        setDetails(res);
        if (res.loading) timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled) setDetails({ loading: false, available: false, details: null });
      }
    };

    setDetails(null);
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedId, activeCursusId]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper || !activeCursus) return;

    const dpr = window.devicePixelRatio || 1;
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#eee';

    const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
    bg.addColorStop(0, '#0c2530');
    bg.addColorStop(0.4, '#081820');
    bg.addColorStop(1, '#050b0f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const { scale, offsetX, offsetY } = viewRef.current;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Les « cercles » du tronc commun (cercle 1 à 6 sur le 42cursus).
    const rings = activeCursus.rings;
    if (rings) {
      ctx.strokeStyle = '#2dd4bf';
      ctx.globalAlpha = 0.45;
      // Épaisseurs en unités du graphe (comme les bordures des nœuds) : sinon
      // les traits paraissent énormes une fois dézoomé et fins une fois zoomé.
      ctx.lineWidth = 4;
      for (const r of rings.radii) {
        ctx.beginPath();
        ctx.arc(rings.cx, rings.cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Liens officiels : les segments tels que 42 les trace. Sous filtre, ceux
    // qui ne mènent à aucun projet du layer s'effacent pour laisser ressortir
    // les autres (les cercles du tronc commun, eux, ne bougent pas).
    const layerAnchors =
      activeLayer === ''
        ? null
        : activeCursus.projects.filter((p) => p.layers.includes(activeLayer));
    const leadsToLayer = (e: HolyGraphEdge) =>
      layerAnchors == null ||
      layerAnchors.some(
        (p) =>
          Math.hypot(p.x - e.x1, p.y - e.y1) <= NODE_RADIUS + 12 ||
          Math.hypot(p.x - e.x2, p.y - e.y2) <= NODE_RADIUS + 12
      );

    ctx.strokeStyle = '#8fa3b0';
    ctx.lineWidth = 9;
    for (const e of activeCursus.edges) {
      ctx.globalAlpha = leadsToLayer(e) ? 0.75 : 0.08;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Les projets déjà faits sont dessinés en premier : ils passent donc sous
    // les projets encore disponibles, comme sur l'intra.
    const ordered = [...activeCursus.projects].sort((a, b) => drawPriority(a) - drawPriority(b));

    const labelBaseSize = NODE_RADIUS * 0.4;
    const labelsVisible = labelBaseSize * scale >= 4.5;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (const p of ordered) {
      const style = STATUS_STYLES[statusOf(p)];
      const isHovered = hovered?.id === p.id;
      const isPinned = pinnedId === p.id;
      const isSelected = selectedId === p.id;
      const isSimulated = simulatedProjectIds.has(p.id);
      // Un layer sélectionné met en avant les projets concernés et estompe
      // le reste, tant que le filtre est actif.
      const layerMatch = activeLayer !== '' && p.layers.includes(activeLayer);
      const dimmed = activeLayer !== '' && !layerMatch;

      ctx.globalAlpha = dimmed ? 0.18 : 1;

      ctx.beginPath();
      if (isRect(p)) {
        ctx.roundRect(p.x - RECT_WIDTH / 2, p.y - RECT_HEIGHT / 2, RECT_WIDTH, RECT_HEIGHT, 12);
      } else {
        ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2);
      }
      ctx.fillStyle = style.fill;
      ctx.fill();

      // Sous filtre, les projets concernés gardent leur apparence normale :
      // ce sont les autres qui s'effacent. Inutile d'épaissir ou de recolorer.
      if (isPinned) {
        ctx.lineWidth = NODE_BORDER_EMPHASIS;
        ctx.strokeStyle = HIGHLIGHT_COLOR;
      } else if (isSelected) {
        ctx.lineWidth = NODE_BORDER_EMPHASIS;
        ctx.strokeStyle = textColor;
      } else if (isSimulated) {
        // Projet ajouté à la simulation : reconnaissable d'un coup d'œil sans
        // avoir à rouvrir chaque nœud.
        ctx.lineWidth = NODE_BORDER_EMPHASIS;
        ctx.strokeStyle = SIMULATED_COLOR;
      } else {
        ctx.lineWidth = isHovered ? NODE_BORDER_HOVER : NODE_BORDER;
        ctx.strokeStyle = isHovered ? textColor : style.stroke;
      }
      ctx.stroke();

      if (!labelsVisible) continue;

      // Le nom est affiché EN ENTIER : on réduit la police jusqu'à ce qu'il
      // tienne dans le nœud, plutôt que de le tronquer.
      const { hw } = halfSize(p);
      const maxWidth = hw * 2 - NODE_BORDER * 2 - 6;
      ctx.font = `600 ${labelBaseSize}px system-ui, sans-serif`;
      const naturalWidth = ctx.measureText(p.name).width;
      const fontSize = naturalWidth > maxWidth
        ? Math.max(labelBaseSize * 0.42, (labelBaseSize * maxWidth) / naturalWidth)
        : labelBaseSize;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = statusOf(p) === 'available' ? '#e2e8f0' : '#04222b';
      ctx.fillText(p.name, p.x, p.y);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();
  }, [activeCursus, hovered, activeLayer, pinnedId, selectedId, simulatedProjectIds]);

  /**
   * Cadre le graphe officiel dans le canvas. Recalculé aussi au resize : sans
   * ça, la vue reste calée sur l'ancienne taille et le graphe part de travers.
   */
  const fitToView = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !activeCursus || activeCursus.projects.length === 0) return;

    const width = wrapper.clientWidth || 1000;
    const height = wrapper.clientHeight || 800;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of activeCursus.projects) {
      minX = Math.min(minX, p.x - NODE_RADIUS);
      minY = Math.min(minY, p.y - NODE_RADIUS);
      maxX = Math.max(maxX, p.x + NODE_RADIUS);
      maxY = Math.max(maxY, p.y + NODE_RADIUS);
    }

    const margin = 40;
    const scale = Math.min((width - margin * 2) / (maxX - minX), (height - margin * 2) / (maxY - minY));
    viewRef.current = {
      scale,
      offsetX: (width - (maxX - minX) * scale) / 2 - minX * scale,
      offsetY: (height - (maxY - minY) * scale) / 2 - minY * scale,
    };
    draw();
  }, [activeCursus, draw]);

  useEffect(() => {
    fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCursus]);

  useEffect(() => {
    draw();
  }, [hovered, draw]);

  // ResizeObserver plutôt que l'évènement `resize` : le canvas est mesuré à sa
  // taille RÉELLE, y compris quand le layout se stabilise après le montage ou
  // que la fenêtre change de zoom — sinon le cadrage est calculé sur une
  // hauteur erronée et le graphe déborde de l'écran.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(() => {
      // `observe()` déclenche un premier appel immédiat, et l'observateur est
      // réinstallé à chaque changement d'état : sans cette garde, un simple
      // clic dans la recherche recadrerait tout et annulerait le zoom demandé.
      const size = `${wrapper.clientWidth}x${wrapper.clientHeight}`;
      if (size === lastSizeRef.current) return;
      lastSizeRef.current = size;
      fitToView();
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [fitToView]);

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = viewRef.current;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  };

  /** Résultats de recherche, par ordre alphabétique. */
  const searchResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '' || !activeCursus) return [];
    return activeCursus.projects
      .filter((p) => p.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [search, activeCursus]);

  // --- Simulation d'un projet depuis le graphe --------------------------------

  /** Entrée de simulation du projet ouvert, si elle existe. */
  const selectedSimulation = useMemo(() => {
    if (!selectedProject || !simData) return null;
    const { id } = simulationTargetOf(selectedProject);
    return simData.simulatedProjects.find((p) => p.projectId === id) ?? null;
  }, [selectedProject, simData, simulationTargetOf]);

  /**
   * Ajoute ou retire le projet ouvert de la simulation.
   *
   * Quand le projet existe dans nos données RNCP, on réutilise son identifiant :
   * c'est alors exactement la simulation du Dashboard. Sinon (tronc commun,
   * examens…), on l'enregistre sous `42-<id>` en déposant son nom et son XP dans
   * `customProjects`, seul endroit où le Dashboard pourra les relire.
   */
  const toggleSimulation = () => {
    if (!selectedProject || !simData || readOnly) return;
    const { id, rncp } = simulationTargetOf(selectedProject);
    const already = simData.simulatedProjects.some((p) => p.projectId === id);
    const customProjects = (simData.customProjects as SimulatorProject[]) ?? [];

    if (already) {
      persistSimulation({
        ...simData,
        simulatedProjects: simData.simulatedProjects.filter((p) => p.projectId !== id),
        // On ne nettoie que NOS entrées : un vrai projet personnalisé créé
        // depuis le Dashboard ne doit pas disparaître d'ici.
        customProjects: customProjects.filter((p) => !(isGraphSimulationId(p.id) && p.id === id)),
      });
      return;
    }

    const xp = details?.details?.xp || selectedProject.difficulty;
    persistSimulation({
      ...simData,
      simulatedProjects: [
        ...simData.simulatedProjects,
        { projectId: id, percentage: 100, coalitionBoost: false },
      ],
      customProjects:
        rncp || customProjects.some((p) => p.id === id)
          ? customProjects
          : [...customProjects, { id, name: selectedProject.name, slug: selectedProject.slug, xp }],
    });
  };

  const changeSimulationPercentage = (value: number) => {
    if (!selectedProject || !simData || readOnly) return;
    const { id, rncp } = simulationTargetOf(selectedProject);
    const clamped = clampPercentage(value, getProjectMaxPercentage(rncp ?? undefined), MIN_PERCENTAGE);
    persistSimulation({
      ...simData,
      simulatedProjects: simData.simulatedProjects.map((p) =>
        p.projectId === id ? { ...p, percentage: clamped } : p
      ),
    });
  };

  /** Centre la vue sur un projet et le met en jaune. */
  const focusProject = (project: HolyGraphProject) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    const scale = 1.1;
    viewRef.current = {
      scale,
      offsetX: width / 2 - project.x * scale,
      offsetY: height / 2 - project.y * scale,
    };
    setPinnedId(project.id);
    // Le champ se vide après la sélection : la liste se referme d'elle-même.
    setSearch('');
    setSearchFocused(false);
    draw();
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setPinnedId(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    const newScale = Math.min(4, Math.max(0.05, view.scale * (e.deltaY < 0 ? 1.15 : 0.87)));

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    view.offsetX = mx - ((mx - view.offsetX) / view.scale) * newScale;
    view.offsetY = my - ((my - view.offsetY) / view.scale) * newScale;
    view.scale = newScale;
    draw();
  };

  /** Projet sous le curseur, ou `null`. Les nœuds dessinés au-dessus priment. */
  const projectAt = (clientX: number, clientY: number): HolyGraphProject | null => {
    if (!activeCursus) return null;
    const world = toWorld(clientX, clientY);
    return (
      [...activeCursus.projects]
        .sort((a, b) => drawPriority(b) - drawPriority(a))
        .find((p) => {
          const { hw, hh } = halfSize(p);
          return Math.abs(p.x - world.x) <= hw && Math.abs(p.y - world.y) <= hh;
        }) ?? null
    );
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setPinnedId(null);
    pressRef.current = { x: e.clientX, y: e.clientY, moved: false };
    draggingRef.current = { x: e.clientX - viewRef.current.offsetX, y: e.clientY - viewRef.current.offsetY };
  };

  /**
   * Ouvre le panneau du projet cliqué, ou le referme si le clic est tombé dans
   * le vide. Un déplacement du graphe n'est PAS un clic : sans cette distinction,
   * chaque glissement rouvrirait ou fermerait le panneau.
   */
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const press = pressRef.current;
    draggingRef.current = null;
    pressRef.current = null;
    if (!press || press.moved) return;
    const clicked = projectAt(e.clientX, e.clientY);
    setSelectedId(clicked?.id ?? null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) {
      const press = pressRef.current;
      if (press && (Math.abs(e.clientX - press.x) > 4 || Math.abs(e.clientY - press.y) > 4)) {
        press.moved = true;
      }
      viewRef.current.offsetX = e.clientX - draggingRef.current.x;
      viewRef.current.offsetY = e.clientY - draggingRef.current.y;
      draw();
      return;
    }

    const found = projectAt(e.clientX, e.clientY);
    if (found?.id !== hovered?.id) setHovered(found);
  };

  return (
    <div className="holy-graph-page">
      <Header />

      <div className="holy-graph-canvas-wrapper" ref={wrapperRef}>
        {loading && <div className="holy-graph-overlay">Chargement…</div>}

        {!loading && error && <div className="holy-graph-overlay">{error}</div>}

        {!loading && !error && data && data.length === 0 && (
          <div className="holy-graph-overlay">
            Aucune donnée synchronisée pour le moment. Va sur le Dashboard pour lancer une première synchro.
          </div>
        )}

        {!loading && !error && activeCursus?.unavailableReason === 'MISSING_PROJECTS_SCOPE' && (
          <div className="holy-graph-overlay">
            Le graphe officiel de 42 n'est pas disponible : l'application 42 de cette instance n'a
            pas le droit de lire <code>project_data</code> (scope «&nbsp;projects&nbsp;»). Le reste
            de l'application fonctionne normalement.
          </div>
        )}

        {!loading && !error && activeCursus?.loading && (
          <div className="holy-graph-overlay">
            Récupération du Holy Graph officiel de 42 pour « {activeCursus.name} »… (une minute la première fois, puis instantané pour tout le monde)
          </div>
        )}

        {!loading && !error && activeCursus && !activeCursus.loading && (
          <>
            <canvas
              ref={canvasRef}
              className={hovered ? 'over-node' : ''}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => {
                draggingRef.current = null;
                pressRef.current = null;
                setHovered(null);
              }}
            />

            <div className="holy-graph-controls">
              {data && data.length > 1 && (
                <div className="holy-graph-tabs">
                  {data.map((c) => (
                    <button
                      key={c.id}
                      className={c.id === activeCursusId ? 'active' : ''}
                      onClick={() => setActiveCursusId(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {activeCursus.layers.length > 0 && (
                <select
                  className="holy-graph-layer"
                  value={activeLayer}
                  onChange={(e) => setActiveLayer(e.target.value)}
                >
                  <option value="">Tous les layers</option>
                  {activeCursus.layers.map((layer) => (
                    <option key={layer} value={layer}>{layer}</option>
                  ))}
                </select>
              )}

              <div className="holy-graph-search">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  // Léger différé : sans ça, le blur ferme la liste avant que
                  // le clic sur un résultat ne soit pris en compte.
                  onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
                  placeholder="Rechercher un projet…"
                />
                {searchFocused && searchResults.length > 0 && (
                  <ul className="holy-graph-search-results">
                    {searchResults.map((p) => (
                      <li key={p.id}>
                        {/* onMouseDown plutôt que onClick : il se déclenche avant
                            le blur du champ, donc un seul clic suffit. */}
                        <button onMouseDown={() => focusProject(p)}>{p.name}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {searchFocused && search.trim() !== '' && searchResults.length === 0 && (
                  <div className="holy-graph-search-empty">Aucun projet</div>
                )}
              </div>
            </div>

            <div className="holy-graph-legend">
              {Object.entries(STATUS_STYLES).map(([key, style]) => (
                <span key={key} className="legend-item">
                  <span className="legend-dot" style={{ background: style.fill, borderColor: style.stroke }} />
                  {STATUS_LABELS[key]}
                </span>
              ))}
              <span className="legend-item">
                <span
                  className="legend-dot"
                  style={{ background: 'transparent', borderColor: SIMULATED_COLOR }}
                />
                Simulé
              </span>
            </div>

            {selectedProject && (
              <ProjectPanel
                project={selectedProject}
                details={details}
                simulation={selectedSimulation}
                simulationXp={
                  simulationTargetOf(selectedProject).rncp?.xp ??
                  (details?.details?.xp || selectedProject.difficulty)
                }
                maxPercentage={getProjectMaxPercentage(
                  simulationTargetOf(selectedProject).rncp ?? undefined
                )}
                hasSubProjects={!!simulationTargetOf(selectedProject).rncp?.subProjects}
                readOnly={readOnly}
                simulationReady={simData !== null}
                onToggleSimulation={toggleSimulation}
                onPercentageChange={changeSimulationPercentage}
                onClose={() => setSelectedId(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HolyGraph;
