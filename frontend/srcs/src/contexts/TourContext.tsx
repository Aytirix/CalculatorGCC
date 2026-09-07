import React, { createContext, useContext, useCallback, useRef } from 'react';
import Shepherd from 'shepherd.js';
import type { Tour as ShepherdTour, StepOptions, StepOptionsButton } from 'shepherd.js';
import { offset } from '@floating-ui/dom';
import { TOUR_STEPS } from '@/config/tourSteps';
import type { TourStepDef } from '@/config/tourSteps';
import { simulationService } from '@/services/simulation.service';

const TOUR_SEEN_KEY = 'gcc_tour_seen_v1';

/**
 * Étapes du guide déjà vues, par identifiant.
 *
 * Un simple « a déjà vu le guide » ne permet rien : quand le parcours gagne des
 * étapes, soit on ne montre rien, soit on rejoue tout. En mémorisant les étapes
 * vues, on ne présente que ce qui a été ajouté depuis le dernier passage —
 * l'utilisateur reprend là où le guide s'est enrichi.
 *
 * Passer ou fermer le guide vaut « vu jusqu'au bout » : on marque alors TOUTES
 * les étapes du parcours courant, faute de quoi il se relancerait sans fin.
 */
const TOUR_STEPS_SEEN_KEY = 'gcc_tour_steps_seen';

function readSeenSteps(): string[] {
  try {
    const raw = localStorage.getItem(TOUR_STEPS_SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSeenSteps(ids: string[]): void {
  try {
    localStorage.setItem(TOUR_STEPS_SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible : le guide se rejouera, sans gravité */
  }
}

/** Étapes jamais vues, dans l'ordre du parcours. */
function pendingSteps(): TourStepDef[] {
  const seen = new Set(readSeenSteps());
  return TOUR_STEPS.filter((step) => !seen.has(step.id));
}

interface TourContextValue {
  startTour: () => void;
  hasSeenTour: () => boolean;
  syncTourSeen: (seen: boolean, seenSteps?: string[]) => void;
  /** Reste-t-il des étapes jamais vues (guide neuf, ou enrichi depuis) ? */
  hasPendingSteps: () => boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers de stacking context
// ---------------------------------------------------------------------------

interface ElevatedNode {
  node: HTMLElement;
  originalZIndex: string;
  originalPosition: string;
}

/**
 * Remonte le DOM depuis `el` et élève le z-index de chaque ancêtre qui crée
 * un stacking context (Framer Motion utilise transform/will-change, ce qui
 * confine les z-index enfants et empêche l'élément d'apparaître au-dessus
 * de l'overlay Shepherd).
 */
const elevateParents = (el: Element): ElevatedNode[] => {
  const elevated: ElevatedNode[] = [];
  let parent = el.parentElement;

  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);

    const createsStackingContext =
      style.position !== 'static' ||
      style.zIndex !== 'auto' ||
      style.transform !== 'none' ||
      style.willChange !== 'auto' ||
      parseFloat(style.opacity) < 1 ||
      style.isolation === 'isolate';

    if (createsStackingContext) {
      elevated.push({
        node: parent,
        originalZIndex: parent.style.zIndex,
        originalPosition: parent.style.position,
      });

      if (style.position === 'static') {
        parent.style.position = 'relative';
      }
      parent.style.zIndex = '9998';
    }

    parent = parent.parentElement;
  }

  return elevated;
};

const restoreParents = (elevated: ElevatedNode[]) => {
  elevated.forEach(({ node, originalZIndex, originalPosition }) => {
    node.style.zIndex = originalZIndex;
    node.style.position = originalPosition;
  });
};

const TARGET_WAIT_TIMEOUT = 10000;

// Attend qu'une cible de tour soit réellement montée dans le DOM.
const waitForElement = async (selector: string, timeoutMs: number = TARGET_WAIT_TIMEOUT): Promise<HTMLElement | null> => {
  const existing = document.querySelector<HTMLElement>(selector);
  if (existing) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return existing;
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return;

      observer.disconnect();
      window.clearTimeout(timeoutId);
      requestAnimationFrame(() => resolve(element));
    });

    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        console.warn(`[Tour] Target not found after ${timeoutMs}ms: ${selector}`);
      }
      resolve(element);
    }, timeoutMs);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tourRef = useRef<ShepherdTour | null>(null);

  const syncTourSeen = useCallback((seen: boolean, seenSteps?: string[]) => {
    if (seen) {
      localStorage.setItem(TOUR_SEEN_KEY, 'true');
    } else {
      localStorage.removeItem(TOUR_SEEN_KEY);
    }
    // La liste vient du serveur : elle fait autorité sur ce que cet utilisateur
    // a déjà vu, quel que soit l'appareil.
    if (seenSteps) writeSeenSteps(seenSteps);
  }, []);

  /**
   * Reste-t-il quelque chose à montrer ?
   *
   * Remplace le « a déjà vu le guide » : un utilisateur qui a tout vu n'a rien
   * en attente, mais il en aura de nouveau dès qu'une étape sera ajoutée.
   */
  const hasPendingSteps = useCallback((): boolean => pendingSteps().length > 0, []);

  const buildTour = useCallback((): ShepherdTour => {
    if (tourRef.current) {
      try { tourRef.current.cancel(); } catch { /* tour déjà terminé */ }
    }

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        classes: 'gcc-tour-step',
        scrollTo: { behavior: 'smooth', block: 'center' },
        cancelIcon: { enabled: true },
        floatingUIOptions: {
          middleware: [offset(20)],
        },
      },
    }) as ShepherdTour;

    // Handler Escape — une seule instance active à la fois
    let escapeBlocker: ((e: KeyboardEvent) => void) | null = null;

    const attachEscapeBlocker = () => {
      escapeBlocker = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };
      document.addEventListener('keydown', escapeBlocker, true);
    };

    const detachEscapeBlocker = () => {
      if (escapeBlocker) {
        document.removeEventListener('keydown', escapeBlocker, true);
        escapeBlocker = null;
      }
    };

    // Handler flèches — bloque ArrowRight/ArrowLeft pour les étapes validation='click'
    let arrowBlocker: ((e: KeyboardEvent) => void) | null = null;

    const attachArrowBlocker = () => {
      arrowBlocker = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };
      document.addEventListener('keydown', arrowBlocker, true);
    };

    const detachArrowBlocker = () => {
      if (arrowBlocker) {
        document.removeEventListener('keydown', arrowBlocker, true);
        arrowBlocker = null;
      }
    };

    // Table des parents élevés par step (pour restauration dans hide)
    const elevatedByStep = new Map<string, ElevatedNode[]>();

    // Uniquement ce que l'utilisateur n'a jamais vu : à la première visite c'est
    // le parcours entier, ensuite ce sont les étapes ajoutées depuis.
    const steps = pendingSteps();

    steps.forEach((stepDef: TourStepDef, index: number) => {
      const isFirst = index === 0;
      const isLast = index === steps.length - 1;
      const targetSelector = stepDef.target ? `[data-tour="${stepDef.target}"]` : null;

      const isBlocking = stepDef.preventSkip || stepDef.blocking;
      const showCancelIcon = !stepDef.preventSkip && stepDef.canClose !== false;

      const buttons: StepOptionsButton[] = [];

      if (stepDef.validation !== 'click') {
        if (!isFirst) {
          buttons.push({
            text: 'Précédent',
            classes: 'gcc-tour-btn gcc-tour-btn--secondary',
            action() { tour.back(); },
          });
        }
        buttons.push({
          text: isLast ? 'Terminer' : 'Suivant',
          classes: 'gcc-tour-btn gcc-tour-btn--primary',
          action() { isLast ? tour.complete() : tour.next(); },
        });
      } else {
        if (!isFirst) {
          buttons.push({
            text: 'Précédent',
            classes: 'gcc-tour-btn gcc-tour-btn--secondary',
            action() { tour.back(); },
          });
        }
        if (!isBlocking) {
          buttons.push({
            text: 'Passer',
            classes: 'gcc-tour-btn gcc-tour-btn--skip',
            action() { tour.next(); },
          });
        }
      }

      const stepOptions: StepOptions = {
        id: stepDef.id,
        title: stepDef.title,
        text: stepDef.text,
        buttons,
        cancelIcon: { enabled: showCancelIcon },

        ...(targetSelector && {
          beforeShowPromise: async () => {
            const element = await waitForElement(targetSelector);
            // Cible introuvable : l'étape s'affichait quand même, détachée, et
            // son `advanceOn` ne pouvait plus jamais se déclencher — une étape
            // sans bouton « Passer » enfermait alors l'utilisateur, sans autre
            // issue que recharger la page. On la saute.
            if (!element) {
              console.warn(`[Tour] Étape « ${stepDef.id} » sautée : cible absente.`);
              // `setTimeout` : `next()` pendant `beforeShowPromise` casserait la
              // machine à états de Shepherd, qui est en train d'afficher.
              setTimeout(() => {
                const current = tour.getCurrentStep();
                if (current?.id !== stepDef.id) return;
                isLast ? tour.complete() : tour.next();
              }, 0);
            }
            return element;
          },
          attachTo: {
            element: () => document.querySelector<HTMLElement>(targetSelector),
            on: stepDef.position ?? 'bottom',
          },
        }),

        ...(stepDef.validation === 'click' && targetSelector && {
          advanceOn: {
            selector: targetSelector,
            event: 'click',
          },
        }),

        when: {
          show() {
            document.body.dataset.tourStep = stepDef.id;
            if (targetSelector) {
              const el = document.querySelector(targetSelector);
              if (el) {
                // 1. Classes de mise en évidence
                el.classList.add('gcc-tour-target');
                if (stepDef.validation === 'click') {
                  el.classList.add('gcc-tour-target--clickable');
                }
                // 2. Élever les ancêtres stacking context pour que l'élément
                //    apparaisse réellement au-dessus de l'overlay (z-index 9997)
                const elevated = elevateParents(el);
                elevatedByStep.set(stepDef.id, elevated);
              }
            }
            if (stepDef.preventSkip) {
              attachEscapeBlocker();
            }
            if (stepDef.validation === 'click') {
              attachArrowBlocker();
            }
          },
          hide() {
            if (document.body.dataset.tourStep === stepDef.id) {
              delete document.body.dataset.tourStep;
            }
            if (targetSelector) {
              const el = document.querySelector(targetSelector);
              el?.classList.remove('gcc-tour-target', 'gcc-tour-target--clickable');
            }
            // Restaurer les z-index des parents élevés
            const elevated = elevatedByStep.get(stepDef.id);
            if (elevated) {
              restoreParents(elevated);
              elevatedByStep.delete(stepDef.id);
            }
            if (stepDef.preventSkip) {
              detachEscapeBlocker();
            }
            if (stepDef.validation === 'click') {
              detachArrowBlocker();
            }
          },
        },
      };

      tour.addStep(stepOptions);
    });

    // Nettoyage global à la fin (complet ou annulé)
    const cleanup = () => {
      detachEscapeBlocker();
      detachArrowBlocker();
      delete document.body.dataset.tourStep;
      // Retirer les classes sur tous les éléments potentiellement oubliés
      document.querySelectorAll('.gcc-tour-target').forEach(el => {
        el.classList.remove('gcc-tour-target', 'gcc-tour-target--clickable');
      });
      // Restaurer tous les parents encore élevés
      elevatedByStep.forEach(elevated => restoreParents(elevated));
      elevatedByStep.clear();
      // Terminé OU passé : dans les deux cas l'utilisateur en a fini avec CES
      // étapes. On les marque toutes, sinon le guide se relancerait sans fin ;
      // et on ne marque que celles-ci, pour que de futures étapes lui soient
      // bien proposées.
      const seen = [...new Set([...readSeenSteps(), ...steps.map((s) => s.id)])];
      writeSeenSteps(seen);
      syncTourSeen(true, seen);
      void simulationService.saveTourSeen(true, seen).catch((error) => {
        console.warn('[Tour] Impossible de sauvegarder l\'état du guide en base:', error);
      });
    };
    tour.on('complete', cleanup);
    tour.on('cancel', cleanup);

    tourRef.current = tour;
    return tour;
  }, [syncTourSeen]);

  const startTour = useCallback(() => {
    const tour = buildTour();
    tour.start();
  }, [buildTour]);

  const hasSeenTour = useCallback((): boolean => {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'true';
  }, []);

  return (
    <TourContext.Provider value={{ startTour, hasSeenTour, syncTourSeen, hasPendingSteps }}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = (): TourContextValue => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour doit être utilisé dans un TourProvider');
  return ctx;
};
