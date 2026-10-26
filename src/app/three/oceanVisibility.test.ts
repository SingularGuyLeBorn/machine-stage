import { describe, expect, it } from "vitest";
import { isInsideInterior, shouldShowOcean } from "./oceanVisibility";

const outside = { x: 40, y: 30, z: 60 };
const base = {
  seaOn: true,
  cameraMode: "orbit" as const,
  walkArea: "",
  cockpitActive: false,
  cameraLocal: outside,
};

describe("ocean visibility", () => {
  it("shows the sea above water on deck / free orbit outside the hull", () => {
    expect(shouldShowOcean({ ...base, modelId: "carrier" })).toBe(true);
    expect(shouldShowOcean({ ...base, modelId: "type055" })).toBe(true);
    expect(
      shouldShowOcean({
        ...base,
        modelId: "carrier",
        cameraMode: "walk",
        walkArea: "deck",
        cameraLocal: { x: 1.6, y: 4.82, z: -1 },
      }),
    ).toBe(true);
    expect(
      shouldShowOcean({
        ...base,
        modelId: "type055",
        cameraMode: "walk",
        walkArea: "z20",
        cameraLocal: { x: 3, y: 16.7, z: -64.5 },
      }),
    ).toBe(true);
    expect(
      shouldShowOcean({
        ...base,
        modelId: "type055",
        cameraMode: "walk",
        walkArea: "deck",
        cameraLocal: { x: 0, y: 15.76, z: -58 },
      }),
    ).toBe(true);
  });

  it("hides the sea in every interior walk area", () => {
    for (const walkArea of [
      "hangar",
      "magazine",
      "engine_room",
      "reactor_room",
      "bridge",
      "cic",
      "crew",
      "crew_berth",
      "crew_mess",
      "workshop",
      "fuel",
    ]) {
      expect(
        shouldShowOcean({
          ...base,
          modelId: "carrier",
          cameraMode: "walk",
          walkArea,
          cameraLocal: { x: 3.15, y: 5.85, z: -3.9 },
        }),
      ).toBe(false);
    }
  });

  it("hides the sea in interior camera presets", () => {
    for (const cameraMode of ["hangar", "engine_room", "bridge", "cic", "reactor_room"] as const) {
      expect(shouldShowOcean({ ...base, modelId: "carrier", cameraMode })).toBe(false);
      expect(shouldShowOcean({ ...base, modelId: "type055", cameraMode })).toBe(false);
    }
  });

  it("hides the sea when free orbit drags the camera inside the hull or superstructure", () => {
    expect(isInsideInterior("carrier", { x: 0, y: 2, z: 0 })).toBe(true);
    expect(isInsideInterior("carrier", { x: 3.15, y: 5.85, z: -3.9 })).toBe(true);
    expect(isInsideInterior("type055", { x: 0, y: 4.3, z: -30 })).toBe(true);
    expect(isInsideInterior("type055", { x: 0, y: 22.5, z: 25 })).toBe(true);
    expect(isInsideInterior("type055", { x: 3, y: 16.7, z: -64.5 })).toBe(false);
    expect(isInsideInterior("carrier", { x: 1.6, y: 4.82, z: -1 })).toBe(false);
    expect(
      shouldShowOcean({ ...base, modelId: "type055", cameraLocal: { x: 0, y: 22.5, z: 25 } }),
    ).toBe(false);
  });

  it("keeps the sea visible for an active cockpit ride and the fixed cockpit view", () => {
    expect(
      shouldShowOcean({
        ...base,
        modelId: "carrier",
        cameraMode: "cockpit",
        cockpitActive: true,
        cameraLocal: { x: 2.82, y: 4.92, z: -10.3 },
      }),
    ).toBe(true);
    expect(
      shouldShowOcean({
        ...base,
        modelId: "carrier",
        cameraMode: "cockpit",
        cockpitActive: false,
        cameraLocal: { x: 2.82, y: 4.92, z: -10.3 },
      }),
    ).toBe(true);
  });

  it("respects the sea toggle", () => {
    expect(shouldShowOcean({ ...base, modelId: "carrier", seaOn: false })).toBe(false);
  });
});
