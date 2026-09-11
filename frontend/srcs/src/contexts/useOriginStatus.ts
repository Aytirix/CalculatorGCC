import { useContext } from 'react';
import { OriginStatusContext } from './OriginStatusContext';

export const useOriginStatus = () => useContext(OriginStatusContext);
