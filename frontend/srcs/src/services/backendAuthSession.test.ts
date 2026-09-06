import { describe, it, expect } from 'vitest';
import {
  sessionCheckMessage,
  sessionMustBeCleared,
  sessionRetryIsWorthIt,
  type SessionCheck,
} from './backend-auth.service';

/**
 * Classification des échecs de session.
 *
 * Ces trois fonctions décident si l'utilisateur est déconnecté et ce qu'on lui
 * propose. Une erreur ici ne se voit pas à l'œil : elle déconnecte au mauvais
 * moment, ou laisse quelqu'un cliquer indéfiniment un bouton qui ne peut pas
 * aboutir.
 */

const NON_VALID: Exclude<SessionCheck, { status: 'valid' }>[] = [
  { status: 'no-token' },
  { status: 'rejected' },
  { status: 'not-configured' },
  { status: 'unreachable' },
  { status: 'throttled' },
  { status: 'unexpected', code: 404 },
];

describe('sessionMustBeCleared', () => {
  it('efface la session quand le serveur refuse le jeton', () => {
    expect(sessionMustBeCleared({ status: 'rejected' })).toBe(true);
  });

  it("efface la session quand le serveur réclame sa configuration initiale", () => {
    // Sans ça, le jeton conservé fait croire au reste de l'application que
    // l'instance est configurée, et la redirection vers l'assistant n'a
    // plus jamais lieu.
    expect(sessionMustBeCleared({ status: 'not-configured' })).toBe(true);
  });

  it('conserve la session sur une panne passagère', () => {
    expect(sessionMustBeCleared({ status: 'unreachable' })).toBe(false);
    expect(sessionMustBeCleared({ status: 'throttled' })).toBe(false);
    expect(sessionMustBeCleared({ status: 'unexpected', code: 502 })).toBe(false);
  });

  it('ne touche à rien quand la session est valide', () => {
    const valid: SessionCheck = {
      status: 'valid',
      me: {
        user_id_42: 1,
        login: 'x',
        email: 'x@x.fr',
        is_public: true,
        is_admin: false,
        credentials_invalid: false,
        next_secret_missing: false,
      },
    };
    expect(sessionMustBeCleared(valid)).toBe(false);
  });
});

describe('sessionRetryIsWorthIt', () => {
  it('propose de réessayer quand la cause est passagère', () => {
    expect(sessionRetryIsWorthIt({ status: 'unreachable' })).toBe(true);
    expect(sessionRetryIsWorthIt({ status: 'throttled' })).toBe(true);
  });

  it('ne propose pas de réessayer sur une cause durable', () => {
    // Un bouton qui rejoue la même erreur enferme l'utilisateur sur l'écran.
    expect(sessionRetryIsWorthIt({ status: 'rejected' })).toBe(false);
    expect(sessionRetryIsWorthIt({ status: 'not-configured' })).toBe(false);
    expect(sessionRetryIsWorthIt({ status: 'unexpected', code: 404 })).toBe(false);
  });

  it("n'est jamais proposé en même temps qu'un effacement de session", () => {
    for (const check of NON_VALID) {
      expect(sessionMustBeCleared(check) && sessionRetryIsWorthIt(check)).toBe(false);
    }
  });
});

describe('sessionCheckMessage', () => {
  it('donne un message non vide pour chaque cause', () => {
    for (const check of NON_VALID) {
      expect(sessionCheckMessage(check).length).toBeGreaterThan(0);
    }
  });

  it('donne un message différent par cause', () => {
    const messages = NON_VALID.map(sessionCheckMessage);
    expect(new Set(messages).size).toBe(NON_VALID.length);
  });

  it("ne promet la conservation de la session que lorsqu'elle l'est vraiment", () => {
    for (const check of NON_VALID) {
      if (/conservée/i.test(sessionCheckMessage(check))) {
        expect(sessionMustBeCleared(check)).toBe(false);
      }
    }
  });

  it("cite le code reçu quand il est inattendu, pour rendre le diagnostic possible", () => {
    expect(sessionCheckMessage({ status: 'unexpected', code: 418 })).toContain('418');
  });
});
