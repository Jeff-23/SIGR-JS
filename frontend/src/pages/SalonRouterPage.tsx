import { DemoSalonPage } from "./SalonPage";
import { RealSalonPage } from "./RealSalonPage";
import { useApp } from "../store/app";

export function SalonRouterPage() {
  const session = useApp((state) => state.session);
  return session?.demo ? <DemoSalonPage/> : <RealSalonPage/>;
}
