import type { IconName } from "../components/Icon";
export type SystemId = "engine" | "abs" | "airbags" | "transmission" | "body";
export type Page = "overview" | "demo" | SystemId;
export type VehicleSystem = {
  id: SystemId;
  label: string;
  description: string;
  icon: IconName;
  availability: "demo" | "unavailable";
};
export const systems: readonly VehicleSystem[] = [
  {
    id: "engine",
    label: "Moteur",
    description: "Codes de défaut · OBD-II / EOBD",
    icon: "engine",
    availability: "demo",
  },
  {
    id: "abs",
    label: "ABS / freinage",
    description: "Freinage et stabilité",
    icon: "brake",
    availability: "unavailable",
  },
  {
    id: "airbags",
    label: "Airbags",
    description: "Sécurité passive",
    icon: "airbag",
    availability: "unavailable",
  },
  {
    id: "transmission",
    label: "Transmission",
    description: "Boîte de vitesses",
    icon: "gear",
    availability: "unavailable",
  },
  {
    id: "body",
    label: "Carrosserie",
    description: "Équipements et confort",
    icon: "body",
    availability: "unavailable",
  },
];
