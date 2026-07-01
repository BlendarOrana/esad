/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // --- START: Added for the infinite scroll animation ---
      animation: {
        scroll: 'scroll 100s linear infinite',
      },
      keyframes: {
        // Here we define the animation's behavior
        scroll: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      // --- END: Added for the infinite scroll animation ---
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        transportservice67: { 
          "primary": "#E30613",         
          "primary-content": "#FFFFFF",   
          
          "secondary": "#111827",       
          "secondary-content": "#FFFFFF", 

          "accent": "#000000",          
          "accent-content": "#FFFFFF",

          "neutral": "#f3f4f6",          
          "neutral-content": "#1f2937",  

          "base-100": "#FFFFFF",         
          "base-200": "#f9fafb",         
          "base-300": "#e5e7eb",         // A light gray for borders

          "base-content": "#111827",     // The default text color (near-black)

          "info": "#3ABFF8",
          "success": "#36D399",
          "warning": "#FBBD23",
          "error": "#F87272",

          "--rounded-box": "1rem",      // 16px. For cards and other containers.
          "--rounded-btn": "9999px",     // Pills for buttons.
          "--rounded-badge": "0.5rem",    // 8px. For modern badges.
        },
      }
    ],
  },
};