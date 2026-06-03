import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface WalletState {
  connected: boolean;
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  connected: false,
  address: null,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

function getPhantom(): { solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toString: () => string } }>; disconnect: () => Promise<void>; on: (event: string, cb: () => void) => void } } | null {
  if (typeof window === "undefined") return null;
  return window as unknown as ReturnType<typeof getPhantom>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const phantom = getPhantom()?.solana;
    if (phantom?.isPhantom) {
      phantom.on("disconnect", () => setAddress(null));
    }
  }, []);

  const connect = useCallback(async () => {
    const phantom = getPhantom()?.solana;
    if (!phantom?.isPhantom) {
      window.open("https://phantom.app/", "_blank");
      return;
    }
    setConnecting(true);
    try {
      const resp = await phantom.connect();
      setAddress(resp.publicKey.toString());
    } catch {
      // user rejected
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    const phantom = getPhantom()?.solana;
    if (phantom?.isPhantom) {
      phantom.disconnect();
    }
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider value={{ connected: !!address, address, connecting, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}
