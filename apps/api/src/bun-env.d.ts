// Minimal Bun runtime type stubs for TypeScript type-checking.
// At runtime, Bun injects these globals natively.
declare const Bun: {
  serve(options: {
    port?: number | string;
    hostname?: string;
    fetch: (req: Request) => Response | Promise<Response>;
    [key: string]: unknown;
  }): { port: number; stop(): void };
};
