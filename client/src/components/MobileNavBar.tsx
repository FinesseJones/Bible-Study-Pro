import { BookOpen, Edit3, Brain, FileText, Scroll, Mic } from "lucide-react";
import { useLocation } from "wouter";

export default function MobileNavBar() {
  const [location, setLocation] = useLocation();

  const navItems = [
    { label: "Library", icon: BookOpen, path: "/" },
    { label: "Notes", icon: Edit3, path: "/notes" },
    { label: "Live", icon: Mic, path: "/live" },
    { label: "AI Teacher", icon: Brain, path: "/assistant" },
    { label: "Vault", icon: FileText, path: "/vault" },
  ];

  const handleNav = (path: string) => {
    setLocation(path);
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0B132B]/90 backdrop-blur-md border-t border-[#D4AF37]/20 safe-pb shadow-[0_-5px_20px_rgba(11,19,43,0.8)]">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          // Check if active: exact match for root, prefix/exact match for others
          const isActive = item.path === "/" 
            ? location === "/" 
            : location.startsWith(item.path);

          const Icon = typeof item.icon === "string" ? Edit3 : item.icon;

          return (
            <button
              key={item.label}
              onClick={() => handleNav(item.path)}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all focus:outline-none relative group"
            >
              <div 
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? "bg-[#D4AF37]/15 text-[#D4AF37] scale-110 shadow-md shadow-[#D4AF37]/5" 
                    : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span 
                className={`text-[10px] mt-0.5 font-medium tracking-wide transition-all ${
                  isActive 
                    ? "text-[#D4AF37] font-semibold" 
                    : "text-[#6B7A8D]"
                }`}
              >
                {item.label}
              </span>
              
              {isActive && (
                <div className="absolute top-0 w-8 h-[2px] bg-[#D4AF37] rounded-full shadow-[0_0_8px_#D4AF37]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
