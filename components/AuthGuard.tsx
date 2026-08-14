"use client";
import { useEffect,useState } from "react";
import { supabase } from "@/lib/supabase";
export default function AuthGuard({children}:{children:React.ReactNode}){const[ready,setReady]=useState(false);useEffect(()=>{let mounted=true;supabase.auth.getSession().then(({data})=>{if(!mounted)return;if(!data.session)location.href="/auth";else setReady(true)});const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{if(!s)location.href="/auth"});return()=>{mounted=false;subscription.unsubscribe()}},[]);if(!ready)return <main className="auth"><div className="auth-card">Đang kiểm tra tài khoản...</div></main>;return <>{children}</>}
