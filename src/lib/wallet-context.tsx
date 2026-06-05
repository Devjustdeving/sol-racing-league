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

function getPhantom(): { solana?: { isPhantom?: boolean; isConnected?: boolean; publicKey?: { toString: () => string }; connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>; disconnect: () => Promise<void>; on: (event: string, cb: () => void) => void } } | null {
  if (typeof window === "undefined") return null;
  return window as unknown as ReturnType<typeof getPhantom>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Auto-reconnect if Phantom was previously approved
  useEffect(() => {
    const phantom = getPhantom()?.solana;
    if (!phantom?.isPhantom) return;

    phantom.on("disconnect", () => setAddress(null));
    phantom.on("connect", () => {
      if (phantom.publicKey) {
        setAddress(phantom.publicKey.toString());
      }
    });

    // Try silent reconnect (only works if user previously connected)
    phantom.connect({ onlyIfTrusted: true })
      .then((resp) => {
        setAddress(resp.publicKey.toString());
      })
      .catch(() => {
        // Not previously approved — user needs to click connect
      });
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
