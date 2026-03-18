// bun:sqlite type stub for Next.js build (bun-types not available in web tsconfig)
declare module "bun:sqlite" {
  export class Database {
    constructor(path?: string, options?: { readonly?: boolean; create?: boolean; readwrite?: boolean });
    exec(sql: string): void;
    query(sql: string): any;
    prepare(sql: string): any;
    close(): void;
    transaction(fn: (...args: any[]) => any): (...args: any[]) => any;
  }
}
