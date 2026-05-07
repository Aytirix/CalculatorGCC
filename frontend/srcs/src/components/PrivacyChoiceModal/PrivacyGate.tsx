import React from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useViewingUser } from '@/contexts/useViewingUser';
import PrivacyChoiceModal from './PrivacyChoiceModal';

const PrivacyGate: React.FC = () => {
  const { isAuthenticated, isPublic, setIsPublic } = useAuth();
  const { isViewingOther } = useViewingUser();

  if (!isAuthenticated || isViewingOther) return null;
  if (isPublic !== null) return null; // undefined (pas chargé) ou bool (déjà choisi)

  return (
    <PrivacyChoiceModal
      onResolved={(value) => setIsPublic(value)}
    />
  );
};

export default PrivacyGate;
