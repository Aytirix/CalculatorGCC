import { useContext } from 'react';
import { RncpDataContext } from './RncpDataContext';

export const useRncpData = () => useContext(RncpDataContext);
