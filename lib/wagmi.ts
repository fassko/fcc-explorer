import { http, createConfig } from "wagmi";
import { flareTestnet, songbirdTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/** Coston2 */
export const COSTON2 = flareTestnet;
/** Coston (Songbird testnet) */
export const COSTON = songbirdTestnet;

export const config = createConfig({
  chains: [COSTON2, COSTON],
  connectors: [injected()],
  transports: {
    [COSTON2.id]: http("https://coston2-api.flare.network/ext/C/rpc"),
    [COSTON.id]: http("https://coston-api.flare.network/ext/C/rpc"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
