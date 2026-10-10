import React from 'react';

export default function Pulp() {
  return (
    <div className="w-full h-full bg-[#FF3B00] text-[#CCFF00] overflow-hidden flex flex-col p-10 relative font-['Space_Grotesk',sans-serif] antialiased selection:bg-[#CCFF00] selection:text-[#FF3B00]">
      
      {/* Background Graphic elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border-[120px] border-[#CCFF00] opacity-10 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#FF0055] opacity-80 blur-3xl pointer-events-none mix-blend-multiply"></div>
      
      {/* Top Nav */}
      <header className="flex justify-between items-start text-xl font-bold uppercase tracking-tight z-20">
        <div className="flex flex-col gap-1">
          <span className="text-4xl font-black tracking-tighter leading-none border-b-4 border-[#CCFF00] pb-1">PULP.</span>
          <span className="text-sm tracking-widest mt-1">Los Angeles</span>
        </div>
        
        <nav className="flex gap-12 items-center text-[16px] tracking-widest mt-2">
          <a href="#" className="hover:text-white transition-colors">Juices</a>
          <a href="#" className="hover:text-white transition-colors">Cleanses</a>
          <a href="#" className="hover:text-white transition-colors">Our Farms</a>
        </nav>

        <button className="bg-[#CCFF00] text-[#FF3B00] px-8 py-3 rounded-full text-lg hover:bg-black hover:text-[#CCFF00] transition-colors border-2 border-transparent hover:border-[#CCFF00] font-black uppercase mt-1">
          Shop Now
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col justify-center relative z-10 w-full">
        <div className="flex flex-col text-left -ml-4">
          <h1 className="text-[280px] leading-[0.78] font-black tracking-[-0.04em] uppercase text-transparent [-webkit-text-stroke:4px_#CCFF00] hover:text-[#CCFF00] transition-colors duration-500 cursor-default">
            CRUSHED
          </h1>
          <h1 className="text-[280px] leading-[0.78] font-black tracking-[-0.04em] uppercase text-[#CCFF00] flex items-center gap-8">
            <svg width="200" height="200" viewBox="0 0 200 200" className="animate-[spin_10s_linear_infinite] shrink-0">
              <path d="M100 0C100 0 120 40 150 50C180 60 200 100 200 100C200 100 160 120 150 150C140 180 100 200 100 200C100 200 80 160 50 150C20 140 0 100 0 100C0 100 40 80 50 50C60 20 100 0 100 0Z" fill="#CCFF00"/>
              <circle cx="100" cy="100" r="30" fill="#FF3B00"/>
            </svg>
            ALIVE.
          </h1>
        </div>
      </main>

      {/* Bottom Footer / Nutrients */}
      <footer className="grid grid-cols-12 gap-8 items-end w-full z-20 pb-4">
        <div className="col-span-3 flex flex-col gap-3 text-sm font-bold uppercase tracking-widest border-t-2 border-[#CCFF00] pt-4">
          <div className="flex justify-between">
            <span>Calories</span>
            <span>120</span>
          </div>
          <div className="flex justify-between">
            <span>Sugar</span>
            <span>14g</span>
          </div>
          <div className="flex justify-between text-white">
            <span>Vitamins</span>
            <span>A, C, K</span>
          </div>
        </div>

        <div className="col-span-6 flex flex-col justify-end items-center text-center px-8">
          <p className="text-2xl font-bold leading-tight uppercase max-w-lg">
            100% Raw, never pasteurized. Cold-pressed daily from ugly fruit to give you beautiful energy.
          </p>
        </div>

        <div className="col-span-3 flex flex-col gap-3 text-sm font-bold uppercase tracking-widest border-t-2 border-[#CCFF00] pt-4 text-right">
          <span className="text-[#CCFF00]">→ No HPP</span>
          <span className="text-[#CCFF00]">→ No Preservatives</span>
          <span className="text-white">→ Just F*cking Juice</span>
        </div>
      </footer>
    </div>
  );
}
