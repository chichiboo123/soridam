import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "녹음", icon: "mic" },
  { path: "/sounds", label: "소리함", icon: "library_music" },
  { path: "/stories", label: "이야기", icon: "auto_awesome" },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden relative">
      <main className="flex-1 overflow-y-auto pb-[100px] md:pb-12 md:pl-28 transition-all flex flex-col">
        {children}
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden absolute bottom-0 left-0 right-0 h-[88px] bg-card border-t-[3px] border-border flex items-center justify-around px-4 z-50 rounded-t-[2rem] shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path} className="flex-1 h-full flex flex-col items-center justify-center gap-1.5 touch-none group">
              <div className={cn(
                "w-16 h-10 rounded-[1.25rem] flex items-center justify-center transition-all",
                isActive ? "bg-primary text-primary-foreground shadow-[0_4px_0_0_rgba(0,0,0,0.15)] -translate-y-1" : "text-muted-foreground group-hover:bg-muted"
              )}>
                <span className={cn("material-symbols-rounded text-[28px] transition-transform", isActive && "font-black")}>
                  {item.icon}
                </span>
              </div>
              <span className={cn(
                "text-[12px] font-black transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Side Nav for Desktop */}
      <nav className="hidden md:flex flex-col absolute top-0 left-0 bottom-0 w-28 bg-card border-r-[3px] border-border py-8 items-center z-50">
        <div className="w-16 h-16 bg-accent text-accent-foreground rounded-[1.5rem] flex items-center justify-center mb-10 shadow-[0_4px_0_0_rgba(0,0,0,0.1)] -rotate-3 hover:rotate-3 transition-transform">
          <span className="material-symbols-rounded text-4xl">record_voice_over</span>
        </div>
        
        <div className="flex flex-col gap-8 flex-1 w-full px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path} className="flex flex-col items-center gap-2 group w-full">
                <div className={cn(
                  "w-20 h-16 rounded-[1.5rem] flex items-center justify-center transition-all",
                  isActive ? "bg-primary text-primary-foreground shadow-[0_6px_0_0_rgba(0,0,0,0.15)] -translate-y-1" : "text-muted-foreground group-hover:bg-muted"
                )}>
                  <span className={cn("material-symbols-rounded text-[32px] transition-transform", isActive && "font-black")}>
                    {item.icon}
                  </span>
                </div>
                <span className={cn(
                  "text-[14px] font-black transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* Footer text properly centered horizontally */}
      <div className="absolute bottom-[96px] md:bottom-6 left-0 md:left-28 right-0 flex justify-center z-40 pointer-events-none">
        <a href="https://litt.ly/chichiboo" target="_blank" rel="noreferrer" className="text-[12px] font-bold text-muted-foreground/60 hover:text-primary transition-colors pointer-events-auto bg-background/90 px-5 py-2 rounded-full backdrop-blur-md border-2 border-border/50 shadow-sm">
          Created by. 교육뮤지컬 꿈꾸는 치수쌤
        </a>
      </div>
    </div>
  );
}
