import { DemoSalonPage } from "./SalonPage";
import { RealSalonPage } from "./RealSalonPage";
import { useApp } from "../store/app";

export function SalonRouterPage() {
  const { session, branchId } = useApp();
  return session?.demo ? <DemoSalonPage/> : <RealSalonPage key={branchId}/>;
}
