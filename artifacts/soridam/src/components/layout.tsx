import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "녹음", icon: "mic" },
  { path: "/sounds", label: "소리", icon: "library_music" },
  { path: "/stories", label: "이야기", icon: "auto_awesome" },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden relative">
      <main className="flex-1 overflow-y-auto pb-[72px] md:pb-0 md:pl-20 transition-all">
        {children}
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden absolute bottom-0 left-0 right-0 h-[72px] bg-card border-t border-border flex items-center justify-around px-2 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path} className="flex-1 h-full flex flex-col items-center justify-center gap-1 touch-none">
              <div className={cn(
                "w-14 h-8 rounded-full flex items-center justify-center transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
              )}>
                <span className={cn("material-symbols-rounded text-2xl transition-all", isActive && "font-medium scale-110")}>
                  {item.icon}
                </span>
              </div>
              <span className={cn(
                "text-[11px] font-medium transition-colors",
                isActive ? "text-primary font-bold" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Side Nav for Desktop */}
      <nav className="hidden md:flex flex-col absolute top-0 left-0 bottom-0 w-20 bg-card border-r border-border py-4 items-center z-50">
        <div className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mb-8 shadow-sm">
          <span className="material-symbols-rounded text-2xl">record_voice_over</span>
        </div>
        
        <div className="flex flex-col gap-4 flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path} className="flex flex-col items-center gap-1 group">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:bg-primary/5",
                  isActive ? "bg-primary/10 text-primary shadow-inner" : "text-muted-foreground"
                )}>
                  <span className={cn("material-symbols-rounded text-2xl transition-transform", isActive && "font-medium scale-110")}>
                    {item.icon}
                  </span>
                </div>
                <span className={cn(
                  "text-[11px] font-medium transition-colors",
                  isActive ? "text-primary font-bold" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col items-center pt-4">
          <a href="https://litt.ly/chichiboo" target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary transition-colors text-center leading-tight">
            Created by.<br/>교육뮤지컬<br/>꿈꾸는<br/>치수쌤
          </a>
        </div>
      </nav>
      
      {/* Mobile Footer text since nav takes bottom */}
      <div className="md:hidden absolute bottom-[76px] w-full text-center py-2 z-40">
        <a href="https://litt.ly/chichiboo" target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
          Created by. 교육뮤지컬 꿈꾸는 치수쌤
        </a>
      </div>
    </div>
  );
}
