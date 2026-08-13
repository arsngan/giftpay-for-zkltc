import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { QueryClient } from '@tanstack/react-query';
import { defineChain } from 'viem';

/*
 * LitVM — Litecoin's Virtual Machine. A zero-knowledge EVM-compatible rollup
 * secured by Litecoin. Testnet chain for the GiftPay dapp.
 */
export const chain = defineChain({
  id: 531050, // LitVM Testnet chain id
  name: 'LitVM Testnet',
  nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.litvm.com'] },
  },
  blockExplorers: {
    default: { name: 'LitVM Explorer', url: 'https://testnet.litvm.com' },
  },
});

export const config = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http() },
});

export const queryClient = new QueryClient();
