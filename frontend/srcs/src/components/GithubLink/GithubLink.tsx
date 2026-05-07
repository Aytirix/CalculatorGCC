import React from 'react';
import './GithubLink.scss';

const GithubLink: React.FC = () => {
  return (
    <a
      className="github-link"
      href="https://github.com/Aytirix/CalculatorGCC"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Voir le code source sur GitHub"
      title="Voir le code source sur GitHub"
    >
      <svg
        className="github-link-icon"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54 0-.27-.01-.97-.02-1.9-3.13.68-3.79-1.51-3.79-1.51-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1.01 1.72 2.65 1.22 3.29.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.55 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.97 0 0 .94-.3 3.09 1.15.9-.25 1.86-.38 2.82-.38.96 0 1.92.13 2.82.38 2.15-1.45 3.09-1.15 3.09-1.15.61 1.54.23 2.69.11 2.97.72.79 1.16 1.79 1.16 3.02 0 4.31-2.63 5.27-5.14 5.54.4.34.76 1.02.76 2.06 0 1.49-.01 2.69-.01 3.05 0 .3.2.65.78.54 4.46-1.49 7.68-5.7 7.68-10.67C23.25 5.48 18.27.5 12 .5z"
        />
      </svg>
    </a>
  );
};

export default GithubLink;
