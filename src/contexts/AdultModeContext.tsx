import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface AdultModeContextType {
  enabled: boolean;
  consentGiven: boolean;
  enable: () => void;
  disable: () => void;
  grantConsent: () => void;
  revokeConsent: () => void;
}

const STORAGE_KEY = "erota.adultMode";
const CONSENT_KEY = "erota.adultConsent";

const AdultModeContext = createContext<AdultModeContextType | null>(null);

export const AdultModeProvider = ({ children }: { children: ReactNode }) => {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [consentGiven, setConsentGiven] = useState<boolean>(false);

  useEffect(() => {
    setConsentGiven(localStorage.getItem(CONSENT_KEY) === "true");
    setEnabled(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const enable = () => {
    setEnabled(true);
    localStorage.setItem(STORAGE_KEY, "true");
  };
  const disable = () => {
    setEnabled(false);
    localStorage.setItem(STORAGE_KEY, "false");
  };
  const grantConsent = () => {
    setConsentGiven(true);
    localStorage.setItem(CONSENT_KEY, "true");
  };
  const revokeConsent = () => {
    setConsentGiven(false);
    setEnabled(false);
    localStorage.removeItem(CONSENT_KEY);
    localStorage.setItem(STORAGE_KEY, "false");
  };

  return (
    <AdultModeContext.Provider
      value={{ enabled, consentGiven, enable, disable, grantConsent, revokeConsent }}
    >
      {children}
    </AdultModeContext.Provider>
  );
};

export const useAdultMode = () => {
  const ctx = useContext(AdultModeContext);
  if (!ctx) throw new Error("useAdultMode must be used within AdultModeProvider");
  return ctx;
};