import BomFilter from "@/components/BomFilter";
import AuthGuard from "@/components/AuthGuard";
export default function Home(){return <AuthGuard><BomFilter/></AuthGuard>}
