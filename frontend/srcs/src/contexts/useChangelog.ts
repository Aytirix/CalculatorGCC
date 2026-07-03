import { useContext } from 'react';
import { ChangelogContext } from './ChangelogContext';

export const useChangelog = () => {
  const context = useContext(ChangelogContext);
  if (!context) {
    throw new Error('useChangelog must be used within a ChangelogProvider');
  }
  return context;
};
