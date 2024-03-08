import { NextUIProvider } from '@nextui-org/react';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { setPolkadotDecimals } from '../../libs/util';
import App from './app/app';
import './styles.css';

setPolkadotDecimals(import.meta.env.VITE_POLKADOT_DECIMALS);
setPolkadotDecimals(import.meta.env.VITE_POLKADOT_DECIMALS);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <NextUIProvider>
      <App />
    </NextUIProvider>
  </StrictMode>,
);
