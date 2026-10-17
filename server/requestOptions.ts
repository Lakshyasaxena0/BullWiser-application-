// Per-request switches (from the user's Settings) that deep service code can read without threading parameters everywhere.
import { AsyncLocalStorage } from "async_hooks";
export interface RequestOptions { useAi: boolean; useAstro: boolean }
const als = new AsyncLocalStorage<RequestOptions>();
export const enterRequestOptions = (o: RequestOptions) => als.enterWith(o);
export const runWithOptions = <T>(o: RequestOptions, fn: () => T) => als.run(o, fn);
export const getRequestOptions = (): RequestOptions => als.getStore() ?? { useAi: true, useAstro: true };
