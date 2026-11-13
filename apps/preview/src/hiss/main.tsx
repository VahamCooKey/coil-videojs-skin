import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-mono/400.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/skin.css';
import './hiss.css';
import { Page } from './page';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>
);
