import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  adminService,
  type AdminConfig,
  type PasskeyInfo,
  type DelegateInfo,
  type GlobalRefreshState,
  type AllowedOriginInfo,
  type GccComparison,
  type GccSectionDiff,
  type GccThresholdDiff,
  type ReferentialOperation,
  type ReferentialState,
  type VersionSummary,
} from '@/services/admin.service';
import './Admin.scss';
import './AdminLogin.scss';
import { useRncpData } from '@/contexts/useRncpData';


/**
 * Onglets du panneau : chacun n'affiche qu'une chose, au lieu de tout empiler.
 *
 * `mirrored: true` marque les réglages qui ne s'appliquent PLUS quand cette
 * instance relaie une autre : les credentials 42, les délégués qui les
 * renouvellent et le refresh des données partagées vivent alors sur l'instance
 * principale. Les afficher ici laisserait croire qu'on agit dessus alors qu'ils
 * ne servent à rien — on les masque. Restent les passkeys (l'accès à ce panneau)
 * et les origines, qui portent le réglage du miroir lui-même : sans elles, on ne
 * pourrait plus revenir en arrière.
 */
const TABS = [
  { id: 'secrets', label: 'Secrets API 42', icon: '🔑', mirrored: true },
  { id: 'passkeys', label: 'Passkeys', icon: '🛡️', mirrored: false },
  { id: 'delegates', label: 'Délégués', icon: '👥', mirrored: true },
  { id: 'origins', label: 'Origines autorisées', icon: '🌐', mirrored: false },
  { id: 'refresh', label: 'Données 42 partagées', icon: '🔄', mirrored: true },
  // Le rapport lit le catalogue 42, donc les credentials, qui vivent sur
  // l'instance principale : masqué en miroir comme les autres.
  { id: 'gcc', label: 'Référentiel RNCP', icon: '📐', mirrored: true },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * « Secrets API 42, Délégués et Données 42 partagées » — les libellés des
 * onglets masqués, repris tels quels pour qu'on retrouve les noms de la sidebar.
 */
const MIRRORED_LABELS = (() => {
  const labels = TABS.filter((entry) => entry.mirrored).map((entry) => entry.label);
  const last = labels[labels.length - 1];
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} et ${last}` : (last ?? '');
})();

/**
 * Un seuil en désaccord. `gcc: null` n'est pas « zéro » : c'est « GCC n'a plus
 * de règle du tout ». Les afficher pareil ferait passer un retrait de l'école
 * pour une exigence tombée à zéro.
 */
const GccThreshold: React.FC<{ threshold: GccThresholdDiff }> = ({ threshold }) => (
  <p className="gcc-threshold">
    {threshold.label} :{' '}
    {threshold.gcc === null ? (
      <strong className="gcc-danger">GCC n'a plus de règle</strong>
    ) : (
      <>GCC <strong>{threshold.gcc}</strong></>
    )}
    , nous <strong>{threshold.ours}</strong>
  </p>
);

/**
 * Même forme d'identifiant que celle qu'exige le serveur.
 *
 * Cochée sans ce contrôle, une ligne dont l'identifiant dérivé du nom GCC est
 * vide ou trop long faisait rejeter TOUT le lot en 400 — les modifications
 * valides comprises, sans que rien n'indique laquelle posait problème.
 */
const VALID_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Clé stable d'une opération, pour la cocher/décocher sans ambiguïté. */
const opKey = (op: ReferentialOperation): string =>
  `${op.kind}:${op.rncpId}:${op.categoryId}:${op.projectId}`;

/**
 * Une section du rapport : un RNCP, ou le bloc commun aux quatre.
 *
 * Les catégories sans écart ne sont pas renvoyées par le backend : une section
 * vide veut dire « conforme », et c'est ce qu'on affiche plutôt que du blanc.
 */
const GccSectionView: React.FC<{
  section: GccSectionDiff;
  selected: Map<string, ReferentialOperation>;
  onToggle: (op: ReferentialOperation) => void;
}> = ({ section, selected, onToggle }) => {
  const empty =
    section.thresholds.length === 0 &&
    section.categories.length === 0 &&
    section.warnings.length === 0;

  return (
    <div className="gcc-section">
      {/* Bandeau de tête : sur un rapport de plusieurs écrans, c'est lui qui dit
          à quel diplôme appartient ce qu'on lit. */}
      <h3 className="gcc-section__title">
        {section.entryId ? (RNCP_LABELS[section.entryId] ?? section.title) : section.title}
        {section.subtitle && <span className="muted"> — {section.subtitle}</span>}
      </h3>

      <div className="gcc-section__body">
      {empty && <p className="gcc-ok">Conforme.</p>}

      {section.warnings.map((warning) => (
        <p key={warning} className="gcc-warning">⚠ {warning}</p>
      ))}

      {section.thresholds.map((t) => (
        <GccThreshold key={t.label} threshold={t} />
      ))}

      {section.categories.map((cat) => (
        <div key={cat.categoryId} className="gcc-category">
          <h4>
            {cat.name} <span className="muted">[tag GCC « {cat.tag} »]</span>
          </h4>

          {/* Une catégorie commune que GCC fait diverger est détaillée sous CHAQUE
              RNCP, mais elle n'existe qu'une fois chez nous : toute action dessus
              vaut donc pour les quatre. Sans cet avertissement, corriger un écart
              propre au RNCP 6.1 le corrige aussi là où GCC ne le demande pas. */}
          {cat.ownerId !== section.entryId && (
            <p className="gcc-warning">
              ⚠ Catégorie commune : cochée ici, la modification s'applique à <strong>tous</strong>{' '}
              les RNCP, pas seulement à {section.title}.
            </p>
          )}

          {cat.thresholds.map((t) => (
            <GccThreshold key={t.label} threshold={t} />
          ))}

          {cat.missing.length > 0 && (
            <div className="gcc-missing">
              <p>
                À ajouter dans <code>{cat.categoryId}</code> — sans risque : un projet en plus
                ne casse aucune sauvegarde.
              </p>
              <ul className="gcc-choices gcc-choices--added">
                {cat.missing.map((m) => {
                  const op: ReferentialOperation = {
                    kind: 'add',
                    rncpId: cat.ownerId,
                    categoryId: cat.categoryId,
                    projectId: m.projectId,
                    slug42: m.slug42,
                  };
                  return (
                    <li key={m.name}>
                      {/* Sans identifiant dérivable du nom GCC, il n'y a rien à
                          ajouter : cocher créerait une entrée d'identifiant vide,
                          persistée dans les simulations et non renommable. */}
                      <label
                        className={
                          !VALID_ID.test(m.projectId)
                            ? 'gcc-choice gcc-choice--disabled'
                            : m.slugUnknown
                              ? 'gcc-choice gcc-choice--risky'
                              : 'gcc-choice'
                        }
                      >
                        <input
                          type="checkbox"
                          disabled={!VALID_ID.test(m.projectId)}
                          checked={selected.has(opKey(op))}
                          onChange={() => onToggle(op)}
                        />
                        <span>
                          <span className="gcc-sign gcc-sign--add">+</span>
                          {VALID_ID.test(m.projectId) ? (
                            <code>{m.projectId}</code>
                          ) : (
                            <>Identifiant inutilisable — à ajouter à la main</>
                          )}
                          <span className="muted"> — « {m.name} »</span>
                          {m.slugUnknown && (
                            <span className="gcc-warning">
                              {' '}⚠ slug 42 inconnu : le projet ne sera jamais reconnu comme fait
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <details>
                <summary className="muted">Voir les lignes TypeScript</summary>
                <pre>{cat.missing.map((m) => m.line).join('\n')}</pre>
              </details>
              <Button
                type="button"
                className="admin-btn"
                onClick={() => navigator.clipboard?.writeText(cat.missing.map((m) => m.line).join('\n'))}
              >
                Copier les {cat.missing.length} ligne{cat.missing.length > 1 ? 's' : ''}
              </Button>
              {cat.missing.some((m) => m.slugUnknown) && (
                <p className="gcc-warning">
                  ⚠ Slug 42 introuvable pour{' '}
                  {cat.missing.filter((m) => m.slugUnknown).map((m) => m.name).join(', ')} : la ligne
                  porte <code>slug42: null</code>, le projet ne sera jamais reconnu comme fait tant
                  qu'il n'est pas renseigné.
                </p>
              )}
            </div>
          )}

          {cat.extra.length > 0 && (
            <div className="gcc-extra">
              <p>Chez nous mais pas chez GCC :</p>
              <ul>
                {cat.extra.map((x) => (
                  <li key={x.id}>
                    <code>{x.id}</code>
                    {x.retired && <span className="muted"> — retiré du cursus par GCC</span>}
                    {/* Deux conseils opposés selon que quelqu'un l'a simulé ou non.
                        Supprimer la ligne ne bloque plus personne, mais fait cesser
                        de compter un projet sans que rien ne l'explique à l'écran :
                        c'est exactement ce que `retired: true` évite. */}
                    {x.simulatedBy > 0 ? (
                      <span className="gcc-danger">
                        {' '}⚠ simulé par {x.simulatedBy} utilisateur{x.simulatedBy > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="muted"> — simulé par personne</span>
                    )}
                    <ul className="gcc-choices">
                      {(() => {
                        const base = { rncpId: cat.ownerId, categoryId: cat.categoryId, projectId: x.id };
                        const retire: ReferentialOperation = { kind: 'retire', ...base };
                        const remove: ReferentialOperation = { kind: 'remove', ...base };
                        return (
                          <>
                            <li>
                              <label className="gcc-choice">
                                <input
                                  type="checkbox"
                                  checked={selected.has(opKey(retire))}
                                  onChange={() => onToggle(retire)}
                                />
                                <span>
                                  <span className="gcc-sign gcc-sign--retire">~</span>
                                  Marquer hors référentiel
                                  <span className="muted">
                                    {' '}— cesse de compter, reste affiché et expliqué
                                  </span>
                                </span>
                              </label>
                            </li>
                            <li>
                              {/* La suppression est refusée côté serveur au-dessus de zéro
                                  simulation : la désactiver ici évite de proposer une action
                                  qui ne peut qu'échouer. */}
                              <label
                                className={x.simulatedBy > 0 ? 'gcc-choice gcc-choice--disabled' : 'gcc-choice'}
                              >
                                <input
                                  type="checkbox"
                                  disabled={x.simulatedBy > 0}
                                  checked={selected.has(opKey(remove))}
                                  onChange={() => onToggle(remove)}
                                />
                                <span>
                                  <span className="gcc-sign gcc-sign--remove">−</span>
                                  Supprimer la ligne
                                  <span className="muted">
                                    {x.simulatedBy > 0
                                      ? ' — impossible tant que quelqu\'un le simule'
                                      : ' — définitif'}
                                  </span>
                                </span>
                              </label>
                            </li>
                          </>
                        );
                      })()}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
};

/**
 * La commande à coller dans la console du navigateur pour récupérer le jeton.
 *
 * `copy()` est une fonction des outils de développement (Chrome comme Firefox) :
 * elle met directement le jeton dans le presse-papier. Sans elle, il faut
 * sélectionner à la souris un JWT de plus de mille caractères affiché sur une
 * seule ligne — et une sélection incomplète donne une erreur incompréhensible.
 *
 * Écrite ici plutôt que dans le JSX : l'imbrication de guillemets la rendrait
 * illisible, et c'est une chaîne à copier telle quelle.
 */
const GCC_TOKEN_SNIPPET =
  "copy(JSON.parse(sessionStorage.getItem(\n" +
  "  'oidc.user:https://auth.42.fr/auth/realms/students-42:frontend-react'\n" +
  ")).access_token)";

/**
 * Noms lisibles des entrées du référentiel. Les identifiants techniques
 * (`rncp7-system-network`) sont parfaits en base et illisibles dans une liste
 * qu'on parcourt à l'œil.
 */
const RNCP_LABELS: Record<string, string> = {
  'rncp-global': 'Commun à tous les RNCP',
  'rncp6-web-mobile': 'RNCP 6 — Web et Mobile',
  'rncp6-applicatif': 'RNCP 6 — Applicatif',
  'rncp7-system-network': "RNCP 7 — Système et réseaux",
  'rncp7-database-data': 'RNCP 7 — Bases de données et data',
};

/** Les versions anciennes portent du texte libre, les récentes du JSON. */
function parseSummary(summary: string): VersionSummary | null {
  try {
    const parsed = JSON.parse(summary);
    return parsed && typeof parsed === 'object' ? (parsed as VersionSummary) : null;
  } catch {
    return null;
  }
}

const KINDS = [
  { key: 'added', label: 'ajouté', sign: '+', className: 'version-chip--added' },
  { key: 'retired', label: 'hors référentiel', sign: '~', className: 'version-chip--retired' },
  { key: 'unretired', label: 'remis', sign: '~', className: 'version-chip--retired' },
  { key: 'removed', label: 'supprimé', sign: '−', className: 'version-chip--removed' },
] as const;

/**
 * Une ligne de résumé lisible d'un coup d'œil : « 12 ajoutés · 3 hors
 * référentiel ». Le détail complet reste accessible juste en dessous — la
 * version précédente concaténait une phrase par opération, ce qui donnait un
 * pavé que personne ne lisait.
 */
const VersionHeadline: React.FC<{ summary: string }> = ({ summary }) => {
  const parsed = parseSummary(summary);
  if (!parsed) {
    // Versions d'avant le résumé structuré : une phrase par opération, mises bout
    // à bout. On n'affiche que le compte ; le texte intégral reste dans le détail.
    const n = legacyCount(summary);
    return (
      <span className="muted">
        {n} modification{n > 1 ? 's' : ''} <em>(format historique)</em>
      </span>
    );
  }
  if (parsed.note) return <>{parsed.note}</>;

  const parts = KINDS.filter((k) => parsed[k.key]?.length).map((k) => (
    <span key={k.key} className={`version-chip ${k.className}`}>
      {k.sign} {parsed[k.key]!.length} {k.label}
    </span>
  ));
  return parts.length > 0 ? <>{parts}</> : <span className="muted">aucune modification</span>;
};

/** Nombre d'opérations d'un résumé au format historique (phrases séparées par « ; »). */
const legacyCount = (summary: string): number => summary.split(' ; ').filter(Boolean).length;

/** Le détail, groupé par catégorie, replié par défaut. */
const VersionDetail: React.FC<{ summary: string }> = ({ summary }) => {
  const parsed = parseSummary(summary);
  if (!parsed) {
    return (
      <details className="version__detail">
        <summary className="muted">Détail</summary>
        <ul className="version__legacy">
          {summary.split(' ; ').filter(Boolean).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    );
  }
  if (parsed.note) return null;

  // Deux niveaux : RNCP, puis catégorie. Une liste plate mélangeait des
  // catégories de diplômes différents sans qu'on puisse les distinguer.
  const byRncp = new Map<string, Map<string, { sign: string; className: string; project: string }[]>>();
  for (const kind of KINDS) {
    for (const entry of parsed[kind.key] ?? []) {
      const [path = '?', project = entry] = entry.split(' · ');
      // Les versions du tout début ne portaient que « catégorie · projet ».
      const [rncp, category] = path.includes(' / ') ? path.split(' / ') : ['—', path];
      if (!byRncp.has(rncp!)) byRncp.set(rncp!, new Map());
      const categories = byRncp.get(rncp!)!;
      if (!categories.has(category!)) categories.set(category!, []);
      categories.get(category!)!.push({ sign: kind.sign, className: kind.className, project });
    }
  }
  if (byRncp.size === 0) return null;

  const shown = KINDS.reduce((n, k) => n + (parsed[k.key]?.length ?? 0), 0);
  return (
    <details className="version__detail">
      <summary className="muted">
        Détail — {byRncp.size} RNCP
        {parsed.total && parsed.total > shown ? ` (${parsed.total - shown} de plus non listées)` : ''}
      </summary>
      {[...byRncp].map(([rncp, categories]) => (
        <div key={rncp} className="version__rncp">
          <h5>{RNCP_LABELS[rncp] ?? rncp}</h5>
          {[...categories].map(([category, items]) => (
            <div key={category} className="version__group">
              <code>{category}</code>
              <ul>
                {items.map((item) => (
                  <li key={`${item.sign}${item.project}`}>
                    <span className={`version-chip ${item.className}`}>{item.sign}</span>{' '}
                    {item.project}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </details>
  );
};

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { reload: reloadRncp } = useRncpData();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
  const [refresh, setRefresh] = useState<GlobalRefreshState | null>(null);
  const [secretForm, setSecretForm] = useState({ client_id: '', client_secret: '', client_secret_next: '' });
  const [newDelegate, setNewDelegate] = useState('');
  const [newPasskeyLabel, setNewPasskeyLabel] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>('secrets');
  const [origins, setOrigins] = useState<AllowedOriginInfo[]>([]);
  const [originsSelf, setOriginsSelf] = useState('');
  const [originsSelfAllowed, setOriginsSelfAllowed] = useState(true);
  const [mirrorUrl, setMirrorUrl] = useState<string | null>(null);
  const [mirrorInput, setMirrorInput] = useState('');
  const [newOrigin, setNewOrigin] = useState('');
  const [newOriginLabel, setNewOriginLabel] = useState('');
  // Le jeton GCC ne vit que le temps de la requête : ni stocké côté serveur, ni
  // renvoyé. On le vide de l'état dès que la comparaison est partie.
  const [gccToken, setGccToken] = useState('');
  const [gccReport, setGccReport] = useState<GccComparison | null>(null);
  const [gccRunning, setGccRunning] = useState(false);
  /** Modifications cochées, prêtes à être appliquées. Clé = `opKey`. */
  const [gccOps, setGccOps] = useState<Map<string, ReferentialOperation>>(new Map());
  const [referential, setReferential] = useState<ReferentialState | null>(null);
  const [exportedTs, setExportedTs] = useState<string | null>(null);

  // En mode miroir, on ne garde que les onglets qui pilotent encore quelque
  // chose ici.
  const visibleTabs = useMemo(
    () => TABS.filter((entry) => !mirrorUrl || !entry.mirrored),
    [mirrorUrl]
  );

  // Onglet réellement affiché : DÉRIVÉ, pas corrigé après coup par un effet.
  // Avec un effet, le rendu qui découvre le mode miroir affichait encore la
  // section « Secrets API 42 » — précisément celle qu'on veut masquer — le temps
  // d'un commit, sans onglet correspondant dans la sidebar.
  const activeTab: TabId = visibleTabs.some((entry) => entry.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? 'origins');

  // Session admin expirée/invalide → on repart proprement vers l'écran d'auth.
  const onAuthError = useCallback((e: any): boolean => {
    if (e?.response?.status === 401) {
      adminService.clearToken();
      navigate('/admin/login');
      return true;
    }
    return false;
  }, [navigate]);

  /**
   * Recharge le panneau section par section.
   *
   * Chaque appel est appliqué INDÉPENDAMMENT des autres. Avec un `Promise.all`,
   * une seule route en panne faisait échouer le lot entier : aucun `setState`
   * n'était appliqué et l'écran affichait un état par défaut faux — champ miroir
   * vide, « base de données locale », liste d'origines vide — impossible à
   * distinguer d'une instance réellement non configurée. C'est ce mécanisme, et
   * pas seulement la route absente qui l'a déclenché, qui rendait le réglage du
   * miroir invisible après une sauvegarde pourtant réussie.
   *
   * Renvoie `true` si tout est passé.
   */
  const reload = useCallback(async () => {
    const failures: string[] = [];
    let stale = false;

    /** Applique le résultat d'une section, ou retient son échec sans bloquer les autres. */
    const section = async <T,>(label: string, load: () => Promise<T>, apply: (value: T) => void) => {
      try {
        apply(await load());
      } catch (e) {
        if (onAuthError(e)) return;
        // Un 404 ici ne veut pas dire « introuvable » : aucun handler admin n'en
        // renvoie. C'est le backend qui n'expose pas (encore) la route.
        if ((e as { response?: { status?: number } })?.response?.status === 404) stale = true;
        failures.push(label);
      }
    };

    await Promise.all([
      section('secrets 42', () => adminService.getConfig(), (cfg) => {
        setConfig(cfg);
        setSecretForm((f) => ({ ...f, client_id: cfg.client_id || f.client_id }));
      }),
      section('passkeys', () => adminService.listPasskeys(), setPasskeys),
      section('délégués', () => adminService.listDelegates(), setDelegates),
      section('données 42 partagées', () => adminService.getGlobalRefresh(), setRefresh),
      section('origines autorisées', () => adminService.listOrigins(), (og) => {
        setOrigins(og.origins);
        setOriginsSelf(og.self);
        setOriginsSelfAllowed(og.self_allowed);
      }),
      section('référentiel RNCP', () => adminService.getReferentialState(), setReferential),
      section('mode miroir', () => adminService.getMirror(), (mi) => {
        setMirrorUrl(mi.mirror_api_url);
        setMirrorInput(mi.mirror_api_url ?? '');
      }),
    ]);

    setLoading(false);
    if (failures.length > 0) {
      setMsg({
        kind: 'err',
        text: stale
          ? `Ce backend n'expose pas encore : ${failures.join(', ')}. Il tourne une version trop ancienne — redémarre-le ou mets-le à jour.`
          : `Sections non chargées : ${failures.join(', ')}. Le reste de l'écran est à jour.`,
      });
    }
    return failures.length === 0;
  }, [onAuthError]);

  useEffect(() => {
    if (!adminService.isAuthenticated()) {
      navigate('/admin/login');
      return;
    }
    reload();
  }, [navigate, reload]);

  // Tant qu'un refresh global tourne, on suit sa progression (le bouton doit
  // rester désactivé jusqu'à la fin, y compris après un rechargement de page).
  useEffect(() => {
    if (!refresh?.running) return;
    const timer = setInterval(async () => {
      try {
        setRefresh(await adminService.getGlobalRefresh());
      } catch {
        /* on réessaiera au tick suivant */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh?.running]);

  const saveMirror = async (url: string | null) => {
    setMsg(null);
    setBusy(true);
    try {
      // On affiche ce que le backend a RÉELLEMENT enregistré, sans attendre le
      // rechargement : si celui-ci échoue, l'écran doit quand même dire vrai.
      const saved = await adminService.setMirror(url);
      setMirrorUrl(saved);
      setMirrorInput(saved ?? '');
      setMsg({
        kind: 'ok',
        text: saved
          ? `Cette instance relaie désormais ${saved}.`
          : 'Cette instance sert de nouveau ses propres données.',
      });
      // Le reste de l'écran ensuite : s'il échoue, il pose son propre message.
      await reload();
    } catch (e: unknown) {
      if (!onAuthError(e)) {
        const response = (e as { response?: { status?: number; data?: { error?: string } } })?.response;
        // Un 404 ici ne veut pas dire « URL introuvable » mais « ce backend ne
        // connaît pas encore ce réglage » : sans cette précision, l'écran donne
        // l'impression que la sauvegarde a été ignorée sans raison.
        const text =
          response?.status === 404
            ? "Ce backend n'expose pas le réglage du miroir : il tourne une version trop ancienne, redémarre-le ou mets-le à jour."
            : response?.data?.error || 'Réglage impossible.';
        setMsg({ kind: 'err', text });
      }
    } finally {
      setBusy(false);
    }
  };

  const addOrigin = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.addOrigin(newOrigin.trim(), newOriginLabel.trim() || undefined);
      setNewOrigin('');
      setNewOriginLabel('');
      await reload();
      setMsg({ kind: 'ok', text: 'Origine autorisée.' });
    } catch (e: unknown) {
      if (!onAuthError(e)) {
        const detail = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setMsg({ kind: 'err', text: detail || 'Origine invalide.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const removeOrigin = async (origin: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.removeOrigin(origin);
      await reload();
      setMsg({ kind: 'ok', text: 'Origine révoquée.' });
    } catch (e: unknown) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Révocation impossible.' });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Lance la comparaison avec GCC. Le jeton part une fois et n'est pas conservé :
   * il expire en cinq minutes de toute façon, et le garder n'apporterait rien
   * qu'un secret de plus dans le navigateur.
   */
  const compareGcc = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setGccRunning(true);
    try {
      const report = await adminService.compareGccReferential(gccToken.trim());
      setGccReport(report);
      setMsg(
        report.anyDiff
          ? { kind: 'err', text: 'Des écarts ont été trouvés — détail ci-dessous.' }
          : { kind: 'ok', text: 'Le référentiel est aligné sur GCC.' }
      );
    } catch (err: any) {
      // Le rapport précédent doit disparaître : laissé sous un message d'erreur,
      // il se lit comme le résultat de la comparaison qui vient d'échouer.
      setGccReport(null);
      if (!onAuthError(err)) {
        setMsg({
          kind: 'err',
          text: err?.response?.data?.message ?? 'La comparaison a échoué.',
        });
      }
    } finally {
      // Vidé dans TOUS les cas, pas seulement en succès : l'échec le plus courant
      // est un jeton expiré, et le laisser à l'écran dans un champ non masqué le
      // rend lisible par-dessus l'épaule ou dans un partage d'écran. Il ne vaut
      // que cinq minutes de toute façon, le garder n'apporte rien.
      setGccToken('');
      setGccRunning(false);
    }
  };

  const toggleGccOp = (op: ReferentialOperation) => {
    setGccOps((prev) => {
      const next = new Map(prev);
      const key = opKey(op);
      if (next.has(key)) next.delete(key);
      else {
        // « Marquer hors référentiel » et « supprimer » s'excluent : les cocher
        // toutes les deux appliquerait la première puis effacerait la ligne.
        if (op.kind === 'retire' || op.kind === 'remove') {
          const other = op.kind === 'retire' ? 'remove' : 'retire';
          next.delete(opKey({ ...op, kind: other } as ReferentialOperation));
        }
        next.set(key, op);
      }
      return next;
    });
  };

  const applyGccOps = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const result = await adminService.applyReferential([...gccOps.values()]);
      setGccOps(new Map());
      setReferential(await adminService.getReferentialState());
      const refus = result.refused.length
        ? ` ${result.refused.length} refusée(s) : ${result.refused.map((r) => r.reason).join(' ; ')}`
        : '';
      setMsg({
        kind: result.refused.length ? 'err' : 'ok',
        text: `Version ${result.version} — ${result.applied.length} modification(s) appliquée(s).${refus}`,
      });
      // Le rapport décrit l'état d'AVANT : le laisser afficherait des écarts
      // qu'on vient de corriger, avec leurs cases à cocher.
      setGccReport(null);
      // Le provider ne récupérait le référentiel qu'une fois par session : sans
      // ce rechargement, l'admin appliquait, allait voir son Dashboard, ne voyait
      // rien changer, et pouvait croire que ça n'avait pas marché.
      reloadRncp();
    } catch (e: any) {
      if (!onAuthError(e)) {
        setMsg({ kind: 'err', text: e?.response?.data?.message ?? "L'application a échoué." });
      }
    } finally {
      setBusy(false);
    }
  };

  const revertReferential = async (version: number) => {
    setMsg(null);
    setBusy(true);
    try {
      const created = await adminService.revertReferential(version);
      setReferential(await adminService.getReferentialState());
      setGccReport(null);
      reloadRncp();
      setMsg({ kind: 'ok', text: `Retour à la version ${version} (nouvelle version ${created}).` });
    } catch (e: any) {
      // Le serveur explique POURQUOI (projets encore simulés, version périmée) :
      // remplacer son message par un générique privait l'admin de l'information
      // dont il a besoin pour décider.
      if (!onAuthError(e)) {
        setMsg({
          kind: 'err',
          text: e?.response?.data?.message ?? 'Retour arrière impossible.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const exportReferential = async () => {
    setMsg(null);
    try {
      const { typescript } = await adminService.exportReferential();
      setExportedTs(typescript);
    } catch (e) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: "L'export a échoué." });
    }
  };

  const startGlobalRefresh = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const { started, state } = await adminService.startGlobalRefresh();
      setRefresh(state);
      setMsg(
        started
          ? { kind: 'ok', text: 'Refresh global lancé. Les requêtes partent progressivement.' }
          : { kind: 'err', text: 'Un refresh global est déjà en cours.' }
      );
    } catch (e) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Impossible de lancer le refresh global.' });
    } finally {
      setBusy(false);
    }
  };

  const saveSecrets = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const next = secretForm.client_secret_next.trim();
      await adminService.updateSecrets({
        client_id: secretForm.client_id.trim(),
        client_secret: secretForm.client_secret,
        ...(next ? { client_secret_next: next } : {}),
      });
      setMsg({ kind: 'ok', text: 'Secrets 42 mis à jour et validés auprès de 42.' });
      setSecretForm((f) => ({ ...f, client_secret: '', client_secret_next: '' }));
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: e?.response?.data?.error || 'Échec de la mise à jour.' });
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.enrollPasskey(newPasskeyLabel.trim() || undefined);
      setNewPasskeyLabel('');
      setMsg({ kind: 'ok', text: 'Passkey enrôlée.' });
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: e?.response?.data?.error || e?.message || 'Enrôlement annulé ou échoué.' });
    } finally {
      setBusy(false);
    }
  };

  const removePasskey = async (id: number) => {
    setMsg(null);
    setBusy(true);
    try {
      const res = await adminService.deletePasskey(id);
      const revoked = res?.sessions_revoked ?? 0;
      // Retirer une passkey coupe les autres sessions owner : on le dit explicitement,
      // sinon rien ne confirme que l'accès de l'authenticator retiré est bien mort.
      setMsg({
        kind: 'ok',
        text: revoked > 0
          ? `Passkey supprimée — ${revoked} session(s) admin révoquée(s).`
          : 'Passkey supprimée.',
      });
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Suppression impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const addDelegate = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.addDelegate(newDelegate.trim().toLowerCase());
      setNewDelegate('');
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: e?.response?.data?.error || 'Ajout impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const removeDelegate = async (login: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.removeDelegate(login);
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Retrait impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await adminService.logout();
    navigate('/admin/login');
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-card"><p className="muted">Chargement…</p></div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-panel">
      <motion.div className="admin-shell" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <aside className="admin-sidebar">
          <div className="admin-sidebar__brand">
            <span className="auth-badge">Administration</span>
            <h1>CalculatorGCC</h1>
          </div>

          {mirrorUrl && (
            <p className="admin-sidebar__note" role="status">
              {/* Les libellés sont dérivés de TABS : réécrits à la main, ils
                  mentiraient dès qu'un drapeau `mirrored` change. */}
              Mode miroir actif : {MIRRORED_LABELS} sont gérés sur l'instance relayée.
            </p>
          )}

          <nav className="admin-sidebar__nav">
            {visibleTabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`admin-tab${activeTab === entry.id ? ' admin-tab--active' : ''}`}
                onClick={() => setTab(entry.id)}
                aria-current={activeTab === entry.id ? 'page' : undefined}
              >
                <span className="admin-tab__icon" aria-hidden="true">{entry.icon}</span>
                {entry.label}
              </button>
            ))}
          </nav>

          <button className="admin-link admin-sidebar__logout" onClick={logout}>
            Déconnexion
          </button>
        </aside>

        <main className="admin-main">

        {/* `role="status"` : sans lui, succès comme erreurs passaient inaperçus
            des lecteurs d'écran — or c'est tout l'objet de ce bandeau. */}
        {msg && (
          <div className={msg.kind === 'ok' ? 'admin-ok' : 'admin-error'} role="status">
            <p>{msg.text}</p>
          </div>
        )}

        {/* ===== Secrets API 42 ===== */}
        {activeTab === 'secrets' && (
        <section className="admin-section">
          <h2>Secrets API 42</h2>
          {config && (
            <div className="admin-status">
              <span>Client ID : <code>{config.client_id || '—'}</code></span>
              <span>Secret courant : {config.current_secret_set ? '✓' : '✗'}</span>
              <span>Next Secret : {config.next_secret_set ? '✓' : '— (à préparer)'}</span>
              {config.credentials_invalid && (
                <span className="warn">⚠️ Credentials invalides — mise à jour requise</span>
              )}
            </div>
          )}
          <form onSubmit={saveSecrets} className="admin-form">
            <div className="form-group">
              <label htmlFor="client_id">Client ID</label>
              <input
                id="client_id"
                type="text"
                value={secretForm.client_id}
                onChange={(e) => setSecretForm({ ...secretForm, client_id: e.target.value })}
                placeholder="Client ID 42"
                required
                disabled={busy}
              />
            </div>
            <div className="form-group">
              <label htmlFor="client_secret">Client Secret</label>
              <input
                id="client_secret"
                type="password"
                value={secretForm.client_secret}
                onChange={(e) => setSecretForm({ ...secretForm, client_secret: e.target.value })}
                placeholder="Secret courant 42"
                autoComplete="off"
                required
                disabled={busy}
              />
            </div>
            <div className="form-group">
              <label htmlFor="client_secret_next">
                Next Secret <span className="optional">(optionnel — relais automatique)</span>
              </label>
              <input
                id="client_secret_next"
                type="password"
                value={secretForm.client_secret_next}
                onChange={(e) => setSecretForm({ ...secretForm, client_secret_next: e.target.value })}
                placeholder="Next secret affiché par l'intra"
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <Button type="submit" className="admin-btn" disabled={busy}>Enregistrer les secrets</Button>
          </form>
        </section>
        )}

        {/* ===== Passkeys ===== */}
        {activeTab === 'passkeys' && (
        <section className="admin-section">
          <h2>Passkeys ({passkeys.length})</h2>
          <ul className="admin-list">
            {passkeys.map((p) => (
              <li key={p.id}>
                <span>
                  {p.label || 'Passkey'} · créée le {new Date(p.created_at).toLocaleDateString()}
                  {p.last_used_at ? ` · utilisée le ${new Date(p.last_used_at).toLocaleDateString()}` : ''}
                </span>
                <button className="admin-link danger" onClick={() => removePasskey(p.id)} disabled={busy}>
                  Supprimer
                </button>
              </li>
            ))}
            {passkeys.length === 0 && (
              <li className="muted">Aucune passkey. Enrôlez-en une pour ne plus dépendre du token console.</li>
            )}
          </ul>
          <div className="admin-inline">
            <input
              type="text"
              value={newPasskeyLabel}
              onChange={(e) => setNewPasskeyLabel(e.target.value)}
              placeholder="Libellé (optionnel)"
              disabled={busy}
            />
            <Button onClick={addPasskey} className="admin-btn" disabled={busy}>+ Ajouter une passkey</Button>
          </div>
        </section>
        )}

        {/* ===== Admins délégués ===== */}
        {activeTab === 'delegates' && (
        <section className="admin-section">
          <h2>Admins délégués ({delegates.length})</h2>
          <p className="muted">Ces logins 42 peuvent éditer les secrets 42 — rien d'autre.</p>
          <ul className="admin-list">
            {delegates.map((d) => (
              <li key={d.login}>
                <span><code>{d.login}</code></span>
                <button className="admin-link danger" onClick={() => removeDelegate(d.login)} disabled={busy}>
                  Retirer
                </button>
              </li>
            ))}
            {delegates.length === 0 && <li className="muted">Aucun délégué.</li>}
          </ul>
          <div className="admin-inline">
            <input
              type="text"
              value={newDelegate}
              onChange={(e) => setNewDelegate(e.target.value)}
              placeholder="login 42"
              disabled={busy}
            />
            <Button onClick={addDelegate} className="admin-btn" disabled={busy || !newDelegate.trim()}>+ Ajouter</Button>
          </div>
        </section>
        )}

        {/* ===== Refresh global des données 42 ===== */}
        {activeTab === 'origins' && (
        <section className="admin-section">
          <h2>Origines autorisées</h2>
          <p className="muted">
            Une autre instance peut servir le frontend et proxifier <code>/api</code> vers ce
            backend : une seule base, un seul serveur, aucun secret partagé. Seules les origines
            listées ici peuvent appeler l'API depuis un autre domaine et recevoir le retour de
            connexion 42. Une révocation prend effet immédiatement.
          </p>

          <div className="admin-status">
            <span>
              Source des données :{' '}
              <code>{mirrorUrl || 'base de données locale'}</code>
            </span>
            <span className="muted">
              {mirrorUrl
                ? "Mode miroir : cette instance ne sert plus ses propres données, elle relaie tout vers l'instance ci-dessus, qui doit avoir autorisé ce domaine. Le panneau admin, lui, reste local."
                : 'Cette instance sert ses propres données. Renseigne ci-dessous l’API d’une autre instance pour relayer vers elle — sans rien reconstruire.'}
            </span>
          </div>

          <div className="admin-inline">
            <input
              value={mirrorInput}
              onChange={(e) => setMirrorInput(e.target.value)}
              placeholder="https://theomouty.fr/api"
              disabled={busy}
            />
            <Button
              onClick={() => saveMirror(mirrorInput.trim() || null)}
              className="admin-btn"
              disabled={busy || mirrorInput.trim() === (mirrorUrl ?? '')}
            >
              {mirrorInput.trim() ? 'Relayer vers cette API' : 'Revenir à la base locale'}
            </Button>
          </div>

          <ul className="admin-list">
            <li>
              <span><code>{originsSelf || '—'}</code></span>
              <span className="muted">
                {originsSelfAllowed
                  ? 'cette instance — toujours autorisée'
                  : 'origine locale en production — non auto-autorisée'}
              </span>
            </li>
            {origins.map((o) => (
              <li key={o.origin}>
                <span>
                  <code>{o.origin}</code>
                  {o.label && <span className="muted"> — {o.label}</span>}
                </span>
                <button className="admin-link danger" onClick={() => removeOrigin(o.origin)} disabled={busy}>
                  Révoquer
                </button>
              </li>
            ))}
            {origins.length === 0 && (
              <li className="muted">Aucune autre origine autorisée.</li>
            )}
          </ul>

          <div className="admin-inline">
            <input
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              placeholder="https://calculator.42nice.fr"
              disabled={busy}
            />
            <input
              value={newOriginLabel}
              onChange={(e) => setNewOriginLabel(e.target.value)}
              placeholder="Libellé (facultatif)"
              disabled={busy}
            />
            <Button onClick={addOrigin} className="admin-btn" disabled={busy || !newOrigin.trim()}>
              + Autoriser
            </Button>
          </div>
        </section>
        )}

        {activeTab === 'refresh' && (
        <section className="admin-section">
          <h2>Données 42 partagées</h2>
          <p className="muted">
            Renouvelle le catalogue des projets et le layout du Holy Graph, puis remet à jour
            l'instantané 42 de tous les utilisateurs. Les requêtes partent au compte-gouttes
            pour respecter les limites de l'API 42 : l'opération peut durer longtemps.
          </p>

          <ul className="admin-list">
            <li>
              <span>Dernier lancement</span>
              <span className="muted">
                {refresh?.startedAt
                  ? `${new Date(refresh.startedAt).toLocaleString('fr-FR')}${refresh.startedBy ? ` — par ${refresh.startedBy}` : ''}`
                  : 'jamais'}
              </span>
            </li>
            {refresh?.finishedAt && !refresh.running && (
              <li>
                <span>Terminé le</span>
                <span className="muted">{new Date(refresh.finishedAt).toLocaleString('fr-FR')}</span>
              </li>
            )}
            {refresh?.running && (
              <li>
                <span>En cours</span>
                <span className="muted">{refresh.usersDone} / {refresh.usersTotal} utilisateurs</span>
              </li>
            )}
            {refresh?.cacheEntries.map((entry) => (
              <li key={entry.key}>
                <span><code>{entry.key}</code></span>
                <span className="muted">mis en cache le {new Date(entry.fetchedAt).toLocaleString('fr-FR')}</span>
              </li>
            ))}
            {refresh && refresh.cacheEntries.length === 0 && (
              <li className="muted">Aucune donnée de référence en cache pour le moment.</li>
            )}
            {refresh?.lastError && (
              <li>
                <span>Dernière erreur</span>
                <span className="muted">{refresh.lastError}</span>
              </li>
            )}
          </ul>

          <Button
            onClick={startGlobalRefresh}
            className="admin-btn"
            disabled={busy || !refresh || refresh.running}
          >
            {refresh?.running ? 'Refresh en cours…' : 'Lancer un refresh global'}
          </Button>
        </section>
        )}

        {/* ===== Référentiel RNCP vs GCC ===== */}
        {activeTab === 'gcc' && (
        <section className="admin-section">
          <h2>Référentiel RNCP</h2>
          <p className="muted">
            Confronte notre référentiel aux règles publiées par GCC, la source de vérité de
            l'école. Rien n'est modifié automatiquement : le rapport sort les lignes à coller
            dans <code>rncpReferential.ts</code>, et dit ce qu'une suppression coûterait.
          </p>

          <details className="gcc-howto">
            <summary>Où trouver le jeton GCC</summary>
            <ol>
              <li>Ouvrir <a href="https://gcc.42.fr" target="_blank" rel="noreferrer">gcc.42.fr</a> et s'y connecter.</li>
              <li>Ouvrir la console du navigateur et y coller la commande ci-dessous.</li>
              <li>Le jeton est alors dans le presse-papier : le coller dans le champ.</li>
            </ol>
            <pre>{GCC_TOKEN_SNIPPET}</pre>
            <Button
              type="button"
              className="admin-btn"
              onClick={() => navigator.clipboard?.writeText(GCC_TOKEN_SNIPPET)}
            >
              Copier la commande
            </Button>
            <p className="muted">
              Le jeton vaut cinq minutes. Il n'est ni stocké ni journalisé : il sert à cet appel
              et disparaît.
            </p>
          </details>

          <form onSubmit={compareGcc} className="admin-form">
            <label htmlFor="gcc-token">Jeton de session GCC</label>
            <textarea
              id="gcc-token"
              className="admin-input gcc-token"
              value={gccToken}
              onChange={(e) => setGccToken(e.target.value)}
              placeholder="eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6…"
              rows={3}
              spellCheck={false}
              autoComplete="off"
            />
            <Button type="submit" className="admin-btn" disabled={gccRunning || !gccToken.trim()}>
              {gccRunning ? 'Comparaison en cours…' : 'Comparer avec GCC'}
            </Button>
          </form>

          {/* Barre d'application : visible dès qu'une case est cochée, pour ne pas
              avoir à redescendre chercher un bouton en bas d'un rapport long. */}
          {gccOps.size > 0 && (
            <div className="gcc-apply" role="status">
              <span>
                <strong>{gccOps.size}</strong> modification{gccOps.size > 1 ? 's' : ''} sélectionnée
                {gccOps.size > 1 ? 's' : ''}
              </span>
              <div>
                <Button type="button" className="admin-btn" onClick={applyGccOps} disabled={busy}>
                  Appliquer
                </Button>
                <button type="button" className="admin-link" onClick={() => setGccOps(new Map())}>
                  Tout décocher
                </button>
              </div>
            </div>
          )}

          {gccReport && (
            <div className="gcc-report">
              {gccReport.warnings.map((warning) => (
                <p key={warning} className="gcc-warning">⚠ {warning}</p>
              ))}
              {!gccReport.anyDiff && (
                <p className="gcc-ok">
                  Aucun écart : le référentiel est aligné sur GCC ({gccReport.rncpCount} RNCP
                  analysés).
                </p>
              )}
              {gccReport.common && (
                <GccSectionView section={gccReport.common} selected={gccOps} onToggle={toggleGccOp} />
              )}
              {gccReport.rncps.map((section) => (
                <GccSectionView
                  key={section.title}
                  section={section}
                  selected={gccOps}
                  onToggle={toggleGccOp}
                />
              ))}
            </div>
          )}

          <h3 className="gcc-history-title">
            Référentiel en base — version {referential?.version ?? '?'}
          </h3>
          <p className="muted">
            La base fait foi à l'exécution ; <code>rncpReferential.ts</code> n'est que la graine du
            premier démarrage. Pas besoin de la tenir à jour : l'export ci-dessous existe pour
            remettre le dépôt d'accord quand ça t'arrange, et si tu ne le fais jamais, seule une
            installation neuve repart d'un référentiel périmé — qu'une comparaison GCC rattrape.
          </p>

          <Button type="button" className="admin-btn" onClick={exportReferential}>
            Exporter en TypeScript
          </Button>
          {exportedTs && (
            <div className="gcc-export">
              <Button
                type="button"
                className="admin-btn"
                onClick={() => navigator.clipboard?.writeText(exportedTs)}
              >
                Copier
              </Button>
              <pre>{exportedTs}</pre>
            </div>
          )}

          <ul className="version-list">
            {referential?.versions.map((v) => (
              <li key={v.version} className="version">
                <div className="version__head">
                  <span>
                    <code>v{v.version}</code> <VersionHeadline summary={v.summary} />
                  </span>
                  <span className="muted">
                    {v.createdBy} · {new Date(v.createdAt).toLocaleString('fr-FR')}
                    {v.version !== referential.version && (
                      <button
                        type="button"
                        className="admin-link"
                        onClick={() => revertReferential(v.version)}
                        disabled={busy}
                      >
                        Revenir ici
                      </button>
                    )}
                  </span>
                </div>
                <VersionDetail summary={v.summary} />
              </li>
            ))}
          </ul>
        </section>
        )}
        </main>
      </motion.div>
    </div>
  );
};

export default AdminPanel;
