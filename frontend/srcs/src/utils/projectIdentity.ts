import type { Project42 } from '@/services/backend-api42.service';
import type { RNCP, SimulatorProject } from '@/types/rncp.types';
import { normalizeProjectSlug } from './projectMatcher';

/**
 * Identité d'un projet : son identifiant 42.
 *
 * Le référentiel RNCP, les simulations et l'intra désignent tous un projet par
 * son identifiant 42 (`42-<id>` côté app, `project.id` côté intra). On ne
 * rapproche donc plus par nom : mesuré sur la production (111 profils), le
 * nom n'apportait rien que l'identifiant ne trouve, et ratait les projets au
 * nom court (`rt`, `war`, `xv`).
 *
 * DERNIER RECOURS seulement : un nom EXACTEMENT égal (normalisé, préfixe de
 * cursus retiré), et seulement s'il désigne un seul projet — pour le jour où
 * 42 renumérote un projet ou en crée une variante. Chaque recours est signalé
 * dans la console, pour qu'on le voie.
 */

/** Identifiant applicatif d'une entrée de l'intra. */
export const apiProjectId = (entry: Pick<Project42, 'project'>): string => `42-${entry.project.id}`;

const stripCursus = (slug: string) => slug.replace(/^42cursus-/, '');

/** Clés de repli d'un projet : nom et slug, normalisés. */
function nameKeys(ref: { name?: string; slug?: string }): string[] {
	const keys = new Set<string>();
	for (const raw of [ref.name, ref.slug ? stripCursus(ref.slug) : undefined]) {
		const key = raw ? normalizeProjectSlug(raw) : '';
		if (key) keys.add(key);
	}
	return [...keys];
}

interface Bucket {
	byId: Map<string, Project42>;
	byName: Map<string, Project42[]>;
}

const emptyBucket = (): Bucket => ({ byId: new Map(), byName: new Map() });

/** Plusieurs inscriptions au même projet : la meilleure note l'emporte. */
export const bestMark = (candidate: Project42, current: Project42) => (candidate.final_mark ?? -1) > (current.final_mark ?? -1);

function add(bucket: Bucket, entry: Project42, prefer: (candidate: Project42, current: Project42) => boolean = bestMark): void {
	const id = apiProjectId(entry);
	const previous = bucket.byId.get(id);
	if (!previous || prefer(entry, previous)) bucket.byId.set(id, entry);
	for (const key of nameKeys({ name: entry.project.name, slug: entry.project.slug })) {
		const list = bucket.byName.get(key) ?? [];
		list.push(entry);
		bucket.byName.set(key, list);
	}
}

export interface ApiProjectIndex {
	validated: Bucket;
	inProgress: Bucket;
	failed: Bucket;
	/** Tous statuts confondus : un nom ne sert de recours que s'il est unique ICI. */
	all: Bucket;
}

/** Index des projets de l'intra : validés, en cours, ratés. */
export function indexApiProjects(entries: readonly Project42[]): ApiProjectIndex {
	const index: ApiProjectIndex = { validated: emptyBucket(), inProgress: emptyBucket(), failed: emptyBucket(), all: emptyBucket() };
	for (const entry of entries) {
		if (!entry?.project) continue;
		add(index.all, entry);
		if (entry.validated === true) add(index.validated, entry);
		else if (entry.status === 'finished') add(index.failed, entry);
		else add(index.inProgress, entry);
	}
	return index;
}

const warned = new Set<string>();

/** Identifiants des projets portant ce nom dans `bucket`. */
function namesakes(bucket: Bucket, ref: { name?: string; slug?: string }): Map<string, Project42> {
	const candidates = new Map<string, Project42>();
	for (const key of nameKeys(ref)) {
		for (const entry of bucket.byName.get(key) ?? []) candidates.set(apiProjectId(entry), entry);
	}
	return candidates;
}

/** L'entrée de l'intra d'un projet : par identifiant, sinon par nom exact s'il est unique. */
function find(bucket: Bucket, ref: { id: string; name?: string; slug?: string }, all: Bucket = bucket): Project42 | null {
	const byId = bucket.byId.get(ref.id);
	if (byId) return byId;
	// Le projet existe sous son identifiant, dans un autre statut : c'est lui,
	// un homonyme ne doit pas le remplacer.
	if (all.byId.has(ref.id)) return null;
	// Recours : le nom désigne UN seul projet parmi TOUTES les entrées (un
	// homonyme en cours ou raté rend le nom ambigu), et ce projet est ici.
	if (namesakes(all, ref).size !== 1) return null;
	const candidates = namesakes(bucket, ref);
	if (candidates.size !== 1) return null;
	// Via `byId` : la meilleure inscription du projet, pas la dernière vue.
	const [candidateId, namesake] = [...candidates.entries()][0];
	const entry = bucket.byId.get(candidateId) ?? namesake;
	const warnKey = `${ref.id}>${apiProjectId(entry)}`;
	if (!warned.has(warnKey)) {
		warned.add(warnKey);
		console.warn(`[Projets] « ${ref.name ?? ref.id} » (${ref.id}) rapproché par son NOM de ${entry.project.slug} (42-${entry.project.id}) : identifiant différent.`);
	}
	return entry;
}

export const findValidated = (index: ApiProjectIndex, ref: { id: string; name?: string; slug?: string }) => find(index.validated, ref, index.all);

/** Statut côté intra d'un projet non validé : en cours, raté, ou rien. */
export function apiStatusOf(index: ApiProjectIndex, ref: { id: string; name?: string; slug?: string }): 'in_progress' | 'failed' | null {
	if (find(index.inProgress, ref, index.all)) return 'in_progress';
	if (find(index.failed, ref, index.all)) return 'failed';
	return null;
}

/** Note finale (bornée 0–125) d'un projet validé, ou null. */
export function finalMarkOf(index: ApiProjectIndex, ref: { id: string; name?: string; slug?: string }): number | null {
	const entry = findValidated(index, ref);
	if (!entry) return null;
	return Math.min(125, Math.max(0, entry.final_mark || 100));
}

/** Tous les projets et modules du référentiel, une fois chacun. */
export function referentialProjects(rncpData: readonly RNCP[]): SimulatorProject[] {
	const all = new Map<string, SimulatorProject>();
	for (const rncp of rncpData) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				if (!all.has(project.id)) all.set(project.id, project);
				for (const sub of project.subProjects ?? []) if (!all.has(sub.id)) all.set(sub.id, sub);
			}
		}
	}
	return [...all.values()];
}

/**
 * Identifiants des projets et modules du référentiel réellement validés sur
 * l'intra, et leur note finale. C'est ce que la validation RNCP reçoit : elle
 * ne compare plus que des identifiants.
 */
export function resolveValidated(rncpData: readonly RNCP[], index: ApiProjectIndex): { ids: string[]; marks: Record<string, number> } {
	const ids: string[] = [];
	const marks: Record<string, number> = {};
	for (const project of referentialProjects(rncpData)) {
		const mark = finalMarkOf(index, project);
		if (mark === null) continue;
		marks[project.id] = mark;
		// Une piscine est acquise par ses modules, jamais par une entrée à son
		// nom : sa note sert, pas sa présence.
		if (project.subProjects?.length) continue;
		ids.push(project.id);
	}
	return { ids, marks };
}

/**
 * Recherche d'une entrée de l'intra pour un projet quelconque (validé ou non),
 * par identifiant puis nom exact unique. `prefer` départage plusieurs
 * inscriptions au même projet.
 */
export function createProjectLookup(
	entries: readonly Project42[],
	prefer: (candidate: Project42, current: Project42) => boolean = bestMark,
): { byId: ReadonlyMap<string, Project42>; find: (ref: { id: string; name?: string; slug?: string }) => Project42 | null } {
	const bucket = emptyBucket();
	for (const entry of entries) if (entry?.project) add(bucket, entry, prefer);
	return { byId: bucket.byId, find: (ref) => find(bucket, ref) };
}
