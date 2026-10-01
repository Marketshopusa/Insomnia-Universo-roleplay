import { Navigate } from "react-router-dom";

/** Old local-creator URL. Video creation lives on the Studio page. */
export default function KinevaLocal() {
  return <Navigate to="/studio" replace />;
}
