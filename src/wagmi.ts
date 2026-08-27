import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { QueryClient } from '@tanstack/react-query';
import { defineChain } from 'viem';

/*
 * LitVM — Litecoin's Virtual Machine. A zero-knowledge EVM-compatible rollup
 * secured by Litecoin. Testnet chain for the GiftPay dapp.
 *
 * Values per LitVM's own docs (docs.litvm.com/get-started-on-testnet/add-to-wallet):
 * chain id 4441, RPC https://liteforge.rpc.caldera.xyz/http, explorer
 * https://liteforge.explorer.caldera.xyz. The previous values here (531050 /
 * rpc.testnet.litvm.com) didn't match any official LitVM network and would
 * have pointed the app at a network that doesn't exist.
 */
export const chain = defineChain({
  id: 4441, // LitVM Testnet (LiteForge) chain id
  name: 'LitVM Testnet',
  nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://liteforge.rpc.caldera.xyz/http'] },
  },
  blockExplorers: {
    default: { name: 'LitVM Explorer', url: 'https://liteforge.explorer.caldera.xyz' },
  },
});

export const config = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http() },
});

export const queryClient = new QueryClient();
