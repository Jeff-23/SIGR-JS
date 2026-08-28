import { useApp } from "../store/app";
import { DemoKitchenPage } from "./KitchenPage";
import { RealKitchenPage } from "./RealKitchenPage";
export function KitchenRouterPage() {
  const { session, branchId } = useApp();
  return session?.demo ? <DemoKitchenPage/> : <RealKitchenPage key={branchId}/>;
}
