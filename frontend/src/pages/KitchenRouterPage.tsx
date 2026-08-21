import { useApp } from "../store/app";
import { DemoKitchenPage } from "./KitchenPage";
import { RealKitchenPage } from "./RealKitchenPage";
export function KitchenRouterPage() {
  const session = useApp((state) => state.session);
  return session?.demo ? <DemoKitchenPage/> : <RealKitchenPage/>;
}
