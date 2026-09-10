import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/main.scss'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary'

// L'ErrorBoundary enveloppe TOUT : une erreur de rendu vidait `#root` sans un mot,
// et l'écran restait noir. Il ne corrige aucune panne — il fait en sorte qu'elle se
// voie, et qu'il reste un bouton à cliquer.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
