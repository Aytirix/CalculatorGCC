import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useViewingUser } from '@/contexts/useViewingUser';
import { simulationService } from '@/services/simulation.service';
import PrivacyChoiceModal from './PrivacyChoiceModal';

const PrivacyGate: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isViewingOther } = useViewingUser();
  const [needsChoice, setNeedsChoice] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || isViewingOther) {
      setNeedsChoice(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { isPublic } = await simulationService.getMyPrivacy();
        if (!cancelled) setNeedsChoice(isPublic === null);
      } catch {
        // En cas d'échec réseau, ne pas bloquer l'UI : le backend traite null comme privé.
        if (!cancelled) setNeedsChoice(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, isViewingOther]);

  if (!isAuthenticated || isViewingOther || !checked || !needsChoice) return null;

  return <PrivacyChoiceModal onResolved={() => setNeedsChoice(false)} />;
};

export default PrivacyGate;
