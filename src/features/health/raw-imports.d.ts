// Vite/Vitest `?raw` imports (file contents as a string), used by escalation.test.ts.
declare module "*?raw" {
  const content: string;
  export default content;
}
