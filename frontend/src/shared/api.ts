import { prototype, type API } from "./types";
let instance: Promise<API> | undefined;
export function getAPI(): Promise<API> {
  return (instance ??= prototype
    ? import("./mock").then((m) => m.mock)
    : import("./native").then((m) => m.native));
}
