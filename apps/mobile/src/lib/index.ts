// apps/mobile/src/lib/index.ts

// Re-export client-side helpers so they can be imported as `../lib`
export * from "./age";
export * from "./families";
export * from "./chains";
export * from "./wallet";
export * from "./gadToken";

// If you later add more client-only helpers (notifications, geo, etc.),
// just extend this barrel file.
