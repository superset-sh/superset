import { atom, useAtom } from "jotai";

const registrationAtom = atom<RegistrationData>({
  name: "",
  email: "",
  phone: "",
  agreedTerms: false,
  agreedPrivacy: false,
});

export function useRegistrationStore() {
  const [data, setData] = useAtom(registrationAtom);

  const updateField = <K extends keyof RegistrationData>(
    key: K,
    value: RegistrationData[K],
  ) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const reset = () => {
    setData({
      name: "",
      email: "",
      phone: "",
      agreedTerms: false,
      agreedPrivacy: false,
    });
  };

  return { data, updateField, reset };
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

export interface RegistrationData {
  name: string;
  email: string;
  phone: string;
  agreedTerms: boolean;
  agreedPrivacy: boolean;
}
