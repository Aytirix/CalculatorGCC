import { useContext } from 'react';
import { ViewingUserContext } from './ViewingUserContext';

export const useViewingUser = () => useContext(ViewingUserContext);
